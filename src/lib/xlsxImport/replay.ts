import type { BusinessDataImport } from "../dataImport";
import Decimal from "decimal.js";
import {
  addAccount,
  addChannel,
  addHolder,
  addPurchase,
  addSale,
  addSettlement,
  addTransfer,
  adjustAccount,
  clearBusinessData,
  createSeedState,
  setTransactionTimestamp
} from "../localStore";
import type { AppState } from "../types";
import { d, nextId } from "../utils";
import {
  accountCurrency,
  collectAccountNames,
  holderKeyFromAccount,
  type AssetFlowRow
} from "./parse";

const DEFAULT_CHANNEL = "未指定";
const OPENING_CHANNEL = "期初庫存";
const HOLDING_CHANNEL = "持有草調整";
const OPENING_DATE = "2020-01-01T00:00:00.000Z";
const HOLDING_SYNC_DATE = "2099-12-31T00:00:00.000Z";
const money = (value: Parameters<typeof d>[0]) => d(value).toDecimalPlaces(2).toFixed(2);
const rate = (value: Parameters<typeof d>[0]) => d(value).toDecimalPlaces(6).toFixed(6);
const IMPORT_OPERATOR = "試算表匯入";

export type ReplayLogEntry = {
  level: "OK" | "SKIP" | "WARN";
  sheetRow: number;
  category: string;
  message: string;
};

export function createImportBaseState(): AppState {
  const seed = createSeedState();
  const cleared = clearBusinessData(seed);
  const admin = cleared.users.find((u) => u.role === "admin");
  if (admin) admin.displayName = IMPORT_OPERATOR;
  return cleared;
}

function ensureMasterData(state: AppState, accountNames: string[], channelNames: string[]) {
  const holderIds = new Map<string, number>();
  for (const accountName of accountNames) {
    const currency = accountCurrency(accountName);
    if (!currency) continue;
    const holderName = holderKeyFromAccount(accountName);
    let holderId = holderIds.get(holderName);
    if (!holderId) {
      addHolder(state, { name: holderName });
      const holder = state.holders.find((h) => h.name === holderName);
      if (!holder) continue;
      holderId = holder.id;
      holderIds.set(holderName, holderId);
    }
    if (!state.accounts.some((a) => a.name === accountName)) {
      addAccount(state, { holderId, name: accountName, currency });
    }
  }

  for (const name of [DEFAULT_CHANNEL, ...channelNames]) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (!state.channels.some((c) => c.name === trimmed)) {
      addChannel(state, { name: trimmed });
    }
  }
}

function accountIdByName(state: AppState, name: string | null): number | null {
  if (!name) return null;
  return state.accounts.find((a) => a.name === name)?.id ?? null;
}

function customerIdByName(state: AppState, name: string | null): number | null {
  if (!name) return null;
  const trimmed = name?.trim();
  if (!trimmed) return null;
  let customer = state.customers.find((c) => c.name === trimmed);
  if (!customer) {
    state.customers.push({
      id: state.customers.length + 1,
      name: trimmed,
      receivableTwd: "0.00",
      isActive: true
    });
    customer = state.customers[state.customers.length - 1];
  }
  return customer.id;
}

function transferAmount(row: AssetFlowRow): string | null {
  return row.settlementOrTransferTwd ?? row.twd;
}

function defaultRateForAccount(rows: AssetFlowRow[], accountName: string): string {
  const sale = rows.find((r) => r.category === "售出" && r.outAccount === accountName && r.rate);
  return sale?.rate ?? "4.650000";
}

/** 流向表買入筆數少於歷史售出時，以未付買入補期初 RMB 庫存（可操作近似）。 */
function ensureOpeningInventory(state: AppState, rows: AssetFlowRow[], logs: ReplayLogEntry[]) {
  const outByAccount = new Map<string, ReturnType<typeof d>>();
  const inByAccount = new Map<string, ReturnType<typeof d>>();
  for (const row of rows) {
    if (row.category === "售出" && row.outAccount && row.rmb) {
      outByAccount.set(row.outAccount, (outByAccount.get(row.outAccount) ?? d(0)).add(row.rmb));
    }
    if (row.category === "買入" && row.inAccount && row.rmb) {
      inByAccount.set(row.inAccount, (inByAccount.get(row.inAccount) ?? d(0)).add(row.rmb));
    }
  }

  for (const [accountName, outTotal] of outByAccount) {
    const inTotal = inByAccount.get(accountName) ?? d(0);
    const gap = outTotal.sub(inTotal);
    if (gap.lte(0)) continue;
    const depositId = accountIdByName(state, accountName);
    if (!depositId) continue;
    const rate = defaultRateForAccount(rows, accountName);
    const rmbAmount = gap.toDecimalPlaces(2).toFixed(2);
    setTransactionTimestamp(OPENING_DATE);
    addPurchase(state, {
      channelName: OPENING_CHANNEL,
      depositAccountId: depositId,
      rmbAmount,
      exchangeRate: rate,
      paymentStatus: "unpaid"
    });
    logs.push({
      level: "WARN",
      sheetRow: 0,
      category: "期初",
      message: `${accountName} 補期初庫存 ${rmbAmount} RMB（未付應付）`
    });
  }
  setTransactionTimestamp(null);
}

/** 依試算表「持有草」列補齊帳戶餘額與 FIFO 批次（重播後售出可能把餘額扣到 0）。 */
export function reconcileRmbHoldings(
  state: AppState,
  holdings: Record<string, string>,
  rows: AssetFlowRow[],
  logs: ReplayLogEntry[]
) {
  const names = Object.keys(holdings);
  if (!names.length) return;

  if (!state.channels.some((c) => c.name === HOLDING_CHANNEL)) {
    addChannel(state, { name: HOLDING_CHANNEL });
  }
  const channel = state.channels.find((c) => c.name === HOLDING_CHANNEL)!;

  setTransactionTimestamp(HOLDING_SYNC_DATE);
  for (const account of state.accounts.filter((a) => a.currency === "RMB")) {
    const target = holdings[account.name];
    if (!target) continue;
    const diff = d(target).sub(account.balance);
    if (diff.lte(0)) continue;

    const addRmb = money(diff);
    const exchangeRate = defaultRateForAccount(rows, account.name);
    const purchaseId = nextId(state.purchases);
    state.purchases.unshift({
      id: purchaseId,
      channelId: channel.id,
      channelName: channel.name,
      depositAccountId: account.id,
      rmbAmount: addRmb,
      exchangeRate: rate(exchangeRate),
      twdCost: money(d(addRmb).mul(exchangeRate)),
      paidTwd: "0.00",
      paymentStatus: "unpaid",
      operatorName: IMPORT_OPERATOR,
      createdAt: HOLDING_SYNC_DATE
    });
    state.rmbLots.push({
      id: nextId(state.rmbLots),
      purchaseId,
      accountId: account.id,
      channelName: channel.name,
      originalRmb: addRmb,
      remainingRmb: addRmb,
      unitCostTwd: rate(exchangeRate),
      exchangeRate: rate(exchangeRate),
      createdAt: HOLDING_SYNC_DATE
    });
    adjustAccount(state, {
      accountId: account.id,
      direction: "in",
      amount: addRmb,
      note: `試算表持有草對齊 ${target}`
    });
    logs.push({
      level: "WARN",
      sheetRow: 0,
      category: "持有草",
      message: `${account.name} 餘額調整 +${addRmb}（目標 ${target}）`
    });
  }
  setTransactionTimestamp(null);
}

/** 依試算表「持有台」列對齊台幣帳戶餘額。 */
export function reconcileTwdHoldings(
  state: AppState,
  holdings: Record<string, string>,
  logs: ReplayLogEntry[]
) {
  if (!Object.keys(holdings).length) return;

  setTransactionTimestamp(HOLDING_SYNC_DATE);
  for (const account of state.accounts.filter((a) => a.currency === "TWD")) {
    const target = holdings[account.name];
    if (!target) continue;
    const diff = d(target).sub(account.balance);
    if (diff.abs().lte(0.01)) continue;

    const amount = money(diff.abs());
    adjustAccount(state, {
      accountId: account.id,
      direction: diff.gt(0) ? "in" : "out",
      amount,
      note: `試算表持有台對齊 ${target}`
    });
    logs.push({
      level: "WARN",
      sheetRow: 0,
      category: "持有台",
      message: `${account.name} 餘額調整 ${diff.gt(0) ? "+" : "-"}${amount}（目標 ${target}）`
    });
  }
  setTransactionTimestamp(null);
}

export function replayAssetFlow(
  state: AppState,
  rows: AssetFlowRow[],
  holdings: { rmb?: Record<string, string>; twd?: Record<string, string> } = {}
): ReplayLogEntry[] {
  const logs: ReplayLogEntry[] = [];
  const channelNames = new Set<string>();
  for (const row of rows) {
    if (row.category === "買入" && row.party?.trim()) channelNames.add(row.party.trim());
  }
  ensureMasterData(state, collectAccountNames(rows), [...channelNames, OPENING_CHANNEL]);
  ensureOpeningInventory(state, rows, logs);

  for (const row of rows) {
    setTransactionTimestamp(row.date);
    try {
      switch (row.category) {
        case "買入": {
          const depositId = accountIdByName(state, row.inAccount);
          const paymentId = accountIdByName(state, row.outAccount);
          if (!depositId || !paymentId || !row.rmb || !row.rate) {
            throw new Error("買入缺少帳戶、草或匯率");
          }
          const channelName = row.party?.trim() || DEFAULT_CHANNEL;
          addPurchase(state, {
            channelName,
            depositAccountId: depositId,
            paymentAccountId: paymentId,
            rmbAmount: row.rmb,
            exchangeRate: row.rate,
            paymentStatus: "paid"
          });
          logs.push({ level: "OK", sheetRow: row.sheetRow, category: row.category, message: "買入已寫入" });
          break;
        }
        case "售出": {
          const accountId = accountIdByName(state, row.outAccount);
          if (!accountId || !row.party || !row.rmb || !row.rate) {
            throw new Error("售出缺少客戶、帳戶、草或匯率");
          }
          addSale(state, {
            customerName: row.party.trim(),
            rmbAccountId: accountId,
            rmbAmount: row.rmb,
            exchangeRate: row.rate
          });
          logs.push({ level: "OK", sheetRow: row.sheetRow, category: row.category, message: "售出已寫入" });
          break;
        }
        case "收帳": {
          const customerId = customerIdByName(state, row.party);
          const accountId = accountIdByName(state, row.inAccount);
          const amount = row.settlementOrTransferTwd;
          if (!customerId || !accountId || !amount) {
            throw new Error("收帳缺少客戶、入帳戶或金額");
          }
          const customer = state.customers.find((c) => c.id === customerId)!;
          if (d(amount).gt(Decimal.max(0, d(customer.receivableTwd)))) {
            logs.push({
              level: "WARN",
              sheetRow: row.sheetRow,
              category: row.category,
              message: `收帳超過應收：應收 ${customer.receivableTwd}，收帳 ${amount}，將記為多付`
            });
          }
          addSettlement(state, {
            customerId,
            accountId,
            amountTwd: amount,
            note: row.note ?? undefined
          });
          logs.push({ level: "OK", sheetRow: row.sheetRow, category: row.category, message: "收帳已寫入" });
          break;
        }
        case "內轉": {
          const fromId = accountIdByName(state, row.outAccount);
          const toId = accountIdByName(state, row.inAccount);
          const amount = transferAmount(row);
          if (!fromId || !toId || !amount) throw new Error("內轉缺少帳戶或金額");
          addTransfer(state, { fromAccountId: fromId, toAccountId: toId, amount, note: row.note ?? undefined });
          logs.push({ level: "OK", sheetRow: row.sheetRow, category: row.category, message: "內轉已寫入" });
          break;
        }
        case "增資": {
          const accountId = accountIdByName(state, row.inAccount);
          const amount = row.twd ?? row.settlementOrTransferTwd;
          if (!accountId || !amount) throw new Error("增資缺少入帳戶或台幣金額");
          adjustAccount(state, {
            accountId,
            direction: "in",
            amount,
            note: row.party ? `增資 ${row.party}` : row.note ?? "試算表增資"
          });
          logs.push({ level: "OK", sheetRow: row.sheetRow, category: row.category, message: "增資已寫入" });
          break;
        }
      }
    } catch (err) {
      logs.push({
        level: "SKIP",
        sheetRow: row.sheetRow,
        category: row.category,
        message: err instanceof Error ? err.message : String(err)
      });
    }
  }

  setTransactionTimestamp(null);
  reconcileRmbHoldings(state, holdings.rmb ?? {}, rows, logs);
  reconcileTwdHoldings(state, holdings.twd ?? {}, logs);
  return logs;
}

export function toBusinessExport(state: AppState): BusinessDataImport {
  return {
    holders: state.holders,
    accounts: state.accounts,
    customers: state.customers,
    channels: state.channels,
    purchases: state.purchases,
    sales: state.sales,
    saleAllocations: state.saleAllocations,
    rmbLots: state.rmbLots,
    ledger: state.ledger
  };
}
