import {
  calcDepositBreakdown,
  calcPeriodSummary,
  entryTypeLabel,
  formatFeeRatePercent,
  profitLedgerStatusLabel,
  reversalStatusLabel
} from "./specialClientWalletShared";
import type {
  SpecialClientDepositBody,
  SpecialClientPayoutBody,
  SpecialClientReverseBody,
  SpecialClientWalletData,
  SpecialClientWalletEntry,
  SpecialClientWalletEntryTypeFilter,
  SpecialClientWalletQuery
} from "./specialClientWalletTypes";
import type { AppState, SpecialClientWalletEntryRecord } from "./types";
import { d, nextId } from "./utils";

const money = (value: Parameters<typeof d>[0]) => d(value).toDecimalPlaces(2).toFixed(2);
const now = () => new Date().toISOString();
const todayEntryDate = () => now().slice(0, 10);

export const DEFAULT_SPECIAL_CLIENT = {
  name: "儲值客戶",
  feeRate: "0.011000"
} as const;

function getSessionUser(state: AppState) {
  if (!state.sessionUserId) return null;
  return state.users.find((user) => user.id === state.sessionUserId) ?? null;
}

function operatorName(state: AppState) {
  const user = getSessionUser(state);
  if (!user) return "未知";
  return user.displayName.trim() || user.username.trim() || "未知";
}

function fmtRmbAmount(value: string) {
  return `¥${d(value).toNumber().toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ensureSpecialClientWalletState(state: AppState) {
  if (!state.specialClients?.length) {
    state.specialClients = [
      { id: 1, name: DEFAULT_SPECIAL_CLIENT.name, feeRate: DEFAULT_SPECIAL_CLIENT.feeRate, isActive: true }
    ];
  }
  if (!state.specialClientWalletEntries) {
    state.specialClientWalletEntries = [];
  }
}

function getClientBalance(state: AppState, clientId: number) {
  const entries = state.specialClientWalletEntries
    .filter((entry) => entry.clientId === clientId)
    .sort((a, b) => b.id - a.id);
  return entries[0]?.balanceAfterRmb ?? "0.00";
}

function assertActiveRmbAccount(state: AppState, accountId: number) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account || !account.isActive) throw new Error("找不到可用的公司 RMB 帳戶");
  if (account.currency !== "RMB") throw new Error("請選擇 RMB 帳戶");
  return account;
}

function assertActiveClient(state: AppState, clientId: number) {
  const client = state.specialClients.find((item) => item.id === clientId);
  if (!client || !client.isActive) throw new Error("找不到可用的特殊客戶");
  return client;
}

function getHistoricalClient(state: AppState, clientId: number) {
  const client = state.specialClients.find((item) => item.id === clientId);
  if (!client) throw new Error("找不到原始特殊客戶，無法沖銷歷史紀錄");
  return client;
}

function getHistoricalRmbAccount(state: AppState, accountId: number) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("找不到原始公司 RMB 帳戶，無法沖銷歷史紀錄");
  if (account.currency !== "RMB") throw new Error("原始公司帳戶幣別異常，無法沖銷歷史紀錄");
  return account;
}

function assertProfitLedgerNotReversed(state: AppState, profitLedgerId: number) {
  const reversed = state.ledger.some((entry) => entry.reversesLedgerId === profitLedgerId);
  if (reversed) throw new Error("此筆利潤流水已沖銷");
}

function applyCashAccountDelta(
  state: AppState,
  accountId: number,
  signedAmount: string,
  direction: "in" | "out",
  relatedId: number,
  description: string,
  entryType: string,
  reversesLedgerId?: number
) {
  const account = assertActiveRmbAccount(state, accountId);
  account.balance = money(d(account.balance).add(signedAmount));
  state.ledger.unshift({
    id: nextId(state.ledger),
    createdAt: now(),
    entryType,
    accountId,
    relatedTable: "special_client_wallet",
    relatedId,
    direction,
    currency: "RMB",
    amount: d(signedAmount).abs().toFixed(2),
    description,
    isReversal: reversesLedgerId !== undefined,
    reversesLedgerId,
    operatorName: operatorName(state)
  });
}

function addProfitLedger(
  state: AppState,
  relatedId: number,
  direction: "in" | "out",
  amount: string,
  description: string,
  reversesLedgerId?: number
) {
  const id = nextId(state.ledger);
  state.ledger.unshift({
    id,
    createdAt: now(),
    entryType: "利潤",
    relatedTable: "special_client_wallet",
    relatedId,
    direction,
    currency: "RMB",
    amount,
    description,
    isReversal: reversesLedgerId !== undefined,
    reversesLedgerId,
    operatorName: operatorName(state)
  });
  return id;
}

function matchesEntryFilters(
  entry: SpecialClientWalletEntryRecord,
  params: {
    clientId?: number;
    dateFrom?: string;
    dateTo?: string;
    entryType?: SpecialClientWalletEntryTypeFilter;
  }
) {
  if (params.clientId && entry.clientId !== params.clientId) return false;
  if (params.dateFrom && entry.entryDate < params.dateFrom) return false;
  if (params.dateTo && entry.entryDate > params.dateTo) return false;
  if (params.entryType && params.entryType !== "all" && entry.type !== params.entryType) return false;
  return true;
}

function serializeWalletEntry(state: AppState, entry: SpecialClientWalletEntryRecord): SpecialClientWalletEntry {
  const client = state.specialClients.find((item) => item.id === entry.clientId);
  const account = state.accounts.find((item) => item.id === entry.cashAccountId);
  const user = state.users.find((item) => item.id === entry.createdBy);
  return {
    id: entry.id,
    clientId: entry.clientId,
    clientName: client?.name ?? "—",
    type: entry.type,
    typeLabel: entryTypeLabel(entry.type, entry.reversedAt),
    entryDate: entry.entryDate,
    usdAmount: entry.usdAmount,
    usdToRmbRate: entry.usdToRmbRate,
    grossRmb: entry.grossRmb,
    feeRate: entry.feeRate,
    feeRmb: entry.feeRmb,
    netCreditRmb: entry.netCreditRmb,
    payoutRmb: entry.payoutRmb,
    vendorName: entry.vendorName,
    purpose: entry.purpose,
    cashAccountId: entry.cashAccountId,
    cashAccountName: account?.name ?? "—",
    cashAccountDelta: entry.cashAccountDelta,
    balanceAfterRmb: entry.balanceAfterRmb,
    profitLedgerId: entry.profitLedgerId,
    profitLedgerStatus: profitLedgerStatusLabel(entry.type, entry.profitLedgerId, entry.reversedAt),
    note: entry.note,
    createdBy: entry.createdBy,
    operatorName: user?.displayName ?? null,
    operatorUsername: user?.username ?? "—",
    createdAt: entry.createdAt,
    reversedAt: entry.reversedAt,
    reversedBy: entry.reversedBy,
    reverseReason: entry.reverseReason,
    originalEntryId: entry.originalEntryId,
    reversalEntryId: entry.reversalEntryId,
    reversalStatus: reversalStatusLabel(entry.type, entry.reversedAt, entry.reverseReason),
    canReverse: entry.type !== "reversal" && !entry.reversedAt && !entry.originalEntryId
  };
}

export function getSpecialClientWallet(
  state: AppState,
  params: SpecialClientWalletQuery = {}
): SpecialClientWalletData {
  ensureSpecialClientWalletState(state);
  const clients = state.specialClients.filter((client) => client.isActive);
  const activeClientId = params.clientId ?? clients[0]?.id;
  const entries = activeClientId
    ? state.specialClientWalletEntries
        .filter((entry) => matchesEntryFilters(entry, { ...params, clientId: activeClientId }))
        .sort((a, b) => {
          const dateCmp = b.entryDate.localeCompare(a.entryDate);
          return dateCmp !== 0 ? dateCmp : b.id - a.id;
        })
        .map((entry) => serializeWalletEntry(state, entry))
    : [];

  const rmbAccounts = state.accounts
    .filter((account) => account.currency === "RMB" && account.isActive)
    .map((account) => ({
      id: account.id,
      name: account.name,
      holderId: account.holderId,
      balance: account.balance
    }));

  const balanceRmb = activeClientId ? getClientBalance(state, activeClientId) : "0.00";
  const periodSummary = calcPeriodSummary(
    entries.map((entry) => ({
      type: entry.type,
      grossRmb: entry.grossRmb,
      feeRmb: entry.feeRmb,
      payoutRmb: entry.payoutRmb,
      reversedAt: entry.reversedAt
    }))
  );

  return {
    clients,
    entries,
    summary: {
      balanceRmb,
      ...periodSummary
    },
    filters: {
      clientId: activeClientId ?? null,
      dateFrom: params.dateFrom ?? null,
      dateTo: params.dateTo ?? null,
      entryType: params.entryType ?? "all"
    },
    selectedClientId: activeClientId ?? null,
    rmbAccounts
  };
}

export function createSpecialClientDeposit(state: AppState, input: SpecialClientDepositBody) {
  ensureSpecialClientWalletState(state);
  if (!input.clientId) throw new Error("請選擇客戶");
  if (!input.cashAccountId) throw new Error("請選擇入帳公司 RMB 帳戶");
  if (!input.entryDate) throw new Error("請填寫日期");

  const client = assertActiveClient(state, input.clientId);
  const account = assertActiveRmbAccount(state, input.cashAccountId);
  const feeRate = input.feeRate?.trim() || client.feeRate || DEFAULT_SPECIAL_CLIENT.feeRate;
  const breakdown = calcDepositBreakdown(input.grossRmb, feeRate);
  const balanceBefore = d(getClientBalance(state, input.clientId));
  const balanceAfter = balanceBefore.add(breakdown.netCreditRmb);
  const operator = getSessionUser(state);
  const entryId = nextId(state.specialClientWalletEntries);

  const entry: SpecialClientWalletEntryRecord = {
    id: entryId,
    clientId: input.clientId,
    type: "deposit",
    entryDate: input.entryDate,
    usdAmount: input.usdAmount ? money(input.usdAmount) : null,
    usdToRmbRate: input.usdToRmbRate ? d(input.usdToRmbRate).toDecimalPlaces(6).toFixed(6) : null,
    grossRmb: breakdown.grossRmb,
    feeRate: breakdown.feeRate,
    feeRmb: breakdown.feeRmb,
    netCreditRmb: breakdown.netCreditRmb,
    payoutRmb: null,
    vendorName: null,
    purpose: null,
    cashAccountId: input.cashAccountId,
    cashAccountDelta: breakdown.grossRmb,
    balanceAfterRmb: money(balanceAfter),
    profitLedgerId: null,
    note: input.note?.trim() || null,
    createdBy: operator?.id ?? state.sessionUserId,
    createdAt: now(),
    reversedAt: null,
    reversedBy: null,
    reverseReason: null,
    originalEntryId: null,
    reversalEntryId: null
  };
  state.specialClientWalletEntries.push(entry);

  applyCashAccountDelta(
    state,
    input.cashAccountId,
    breakdown.grossRmb,
    "in",
    entry.id,
    `特殊客戶儲值入帳 ${account.name} ${fmtRmbAmount(breakdown.grossRmb)}`,
    "特殊客戶儲值"
  );

  const profitDescription = `特殊客戶代付服務費｜客戶：${client.name}｜結匯 ${fmtRmbAmount(breakdown.grossRmb)}｜費率 ${formatFeeRatePercent(breakdown.feeRate)}`;
  entry.profitLedgerId = addProfitLedger(state, entry.id, "in", breakdown.feeRmb, profitDescription);

  return getSpecialClientWallet(state, { clientId: input.clientId });
}

export function createSpecialClientPayout(state: AppState, input: SpecialClientPayoutBody) {
  ensureSpecialClientWalletState(state);
  if (!input.clientId) throw new Error("請選擇客戶");
  if (!input.cashAccountId) throw new Error("請選擇付款公司 RMB 帳戶");
  if (!input.entryDate) throw new Error("請填寫日期");

  const payout = d(input.payoutRmb);
  if (payout.lte(0)) throw new Error("代付 RMB 金額必須大於 0");

  const client = assertActiveClient(state, input.clientId);
  const account = assertActiveRmbAccount(state, input.cashAccountId);
  const payoutRmb = money(payout);
  const balanceBefore = d(getClientBalance(state, input.clientId));
  const balanceAfter = balanceBefore.sub(payoutRmb);
  const vendorLabel = input.vendorName?.trim() || input.purpose?.trim() || "代付";
  const operator = getSessionUser(state);

  const entry: SpecialClientWalletEntryRecord = {
    id: nextId(state.specialClientWalletEntries),
    clientId: input.clientId,
    type: "payout",
    entryDate: input.entryDate,
    usdAmount: null,
    usdToRmbRate: null,
    grossRmb: null,
    feeRate: null,
    feeRmb: null,
    netCreditRmb: null,
    payoutRmb,
    vendorName: input.vendorName?.trim() || null,
    purpose: input.purpose?.trim() || null,
    cashAccountId: input.cashAccountId,
    cashAccountDelta: money(payout.neg()),
    balanceAfterRmb: money(balanceAfter),
    profitLedgerId: null,
    note: input.note?.trim() || null,
    createdBy: operator?.id ?? state.sessionUserId,
    createdAt: now(),
    reversedAt: null,
    reversedBy: null,
    reverseReason: null,
    originalEntryId: null,
    reversalEntryId: null
  };
  state.specialClientWalletEntries.push(entry);

  applyCashAccountDelta(
    state,
    input.cashAccountId,
    money(payout.neg()),
    "out",
    entry.id,
    `特殊客戶代付 ${client.name} → ${vendorLabel} ${fmtRmbAmount(payoutRmb)}`,
    "特殊客戶代付"
  );

  return getSpecialClientWallet(state, { clientId: input.clientId });
}

export function reverseSpecialClientWalletEntry(state: AppState, input: SpecialClientReverseBody) {
  ensureSpecialClientWalletState(state);
  const reason = input.reverseReason?.trim();
  if (!reason) throw new Error("請填寫沖銷原因");

  const original = state.specialClientWalletEntries.find((entry) => entry.id === input.entryId);
  if (!original) throw new Error("找不到流水紀錄");
  if (original.type === "reversal" || original.originalEntryId) {
    throw new Error("沖銷紀錄不可再次沖銷");
  }
  if (original.reversedAt || original.reversalEntryId) {
    throw new Error("此筆紀錄已沖銷，不可重複沖銷");
  }

  const client = getHistoricalClient(state, original.clientId);
  const account = getHistoricalRmbAccount(state, original.cashAccountId);
  const balanceBefore = d(getClientBalance(state, original.clientId));
  const entryDate = todayEntryDate();
  const operator = getSessionUser(state);
  let reversalEntryId = 0;

  if (original.type === "deposit") {
    const gross = d(original.grossRmb ?? 0);
    const net = d(original.netCreditRmb ?? 0);
    const fee = d(original.feeRmb ?? 0);
    if (gross.lte(0)) throw new Error("原始儲值金額異常");

    const balanceAfter = balanceBefore.sub(net);
    const reversalEntry: SpecialClientWalletEntryRecord = {
      id: nextId(state.specialClientWalletEntries),
      clientId: original.clientId,
      type: "reversal",
      entryDate,
      grossRmb: original.grossRmb,
      feeRate: original.feeRate,
      feeRmb: original.feeRmb,
      netCreditRmb: money(net.neg()),
      usdAmount: original.usdAmount,
      usdToRmbRate: original.usdToRmbRate,
      payoutRmb: null,
      vendorName: null,
      purpose: null,
      cashAccountId: original.cashAccountId,
      cashAccountDelta: money(gross.neg()),
      balanceAfterRmb: money(balanceAfter),
      profitLedgerId: null,
      note: reason,
      createdBy: operator?.id ?? state.sessionUserId,
      createdAt: now(),
      reversedAt: null,
      reversedBy: null,
      reverseReason: null,
      originalEntryId: original.id,
      reversalEntryId: null
    };
    state.specialClientWalletEntries.push(reversalEntry);
    reversalEntryId = reversalEntry.id;

    const cashLedger = state.ledger.find(
      (entry) =>
        entry.relatedTable === "special_client_wallet" &&
        entry.relatedId === original.id &&
        !entry.isReversal &&
        entry.accountId
    );

    applyCashAccountDelta(
      state,
      original.cashAccountId,
      money(gross.neg()),
      "out",
      reversalEntry.id,
      `沖銷特殊客戶儲值 ${account.name} ${fmtRmbAmount(original.grossRmb ?? "0")}`,
      "特殊客戶沖銷",
      cashLedger?.id
    );

    if (original.profitLedgerId) {
      assertProfitLedgerNotReversed(state, original.profitLedgerId);
      const profitDescription = `沖銷特殊客戶代付服務費｜客戶：${client.name}｜結匯 ${fmtRmbAmount(original.grossRmb ?? "0")}｜費率 ${formatFeeRatePercent(original.feeRate ?? DEFAULT_SPECIAL_CLIENT.feeRate)}`;
      reversalEntry.profitLedgerId = addProfitLedger(
        state,
        reversalEntry.id,
        "out",
        money(fee),
        profitDescription,
        original.profitLedgerId
      );
    }
  } else if (original.type === "payout") {
    const payout = d(original.payoutRmb ?? 0);
    if (payout.lte(0)) throw new Error("原始代付金額異常");
    const balanceAfter = balanceBefore.add(payout);

    const reversalEntry: SpecialClientWalletEntryRecord = {
      id: nextId(state.specialClientWalletEntries),
      clientId: original.clientId,
      type: "reversal",
      entryDate,
      grossRmb: null,
      feeRate: null,
      feeRmb: null,
      netCreditRmb: null,
      usdAmount: null,
      usdToRmbRate: null,
      payoutRmb: original.payoutRmb,
      vendorName: original.vendorName,
      purpose: original.purpose,
      cashAccountId: original.cashAccountId,
      cashAccountDelta: money(payout),
      balanceAfterRmb: money(balanceAfter),
      profitLedgerId: null,
      note: reason,
      createdBy: operator?.id ?? state.sessionUserId,
      createdAt: now(),
      reversedAt: null,
      reversedBy: null,
      reverseReason: null,
      originalEntryId: original.id,
      reversalEntryId: null
    };
    state.specialClientWalletEntries.push(reversalEntry);
    reversalEntryId = reversalEntry.id;

    const cashLedger = state.ledger.find(
      (entry) =>
        entry.relatedTable === "special_client_wallet" &&
        entry.relatedId === original.id &&
        !entry.isReversal &&
        entry.accountId
    );

    applyCashAccountDelta(
      state,
      original.cashAccountId,
      money(payout),
      "in",
      reversalEntry.id,
      `沖銷特殊客戶代付 ${client.name} → ${original.vendorName ?? "廠商"} ${fmtRmbAmount(original.payoutRmb ?? "0")}`,
      "特殊客戶沖銷",
      cashLedger?.id
    );
  } else {
    throw new Error("不支援的流水類型");
  }

  original.reversedAt = now();
  original.reversedBy = operator?.id ?? state.sessionUserId;
  original.reverseReason = reason;
  original.reversalEntryId = reversalEntryId;

  return getSpecialClientWallet(state, { clientId: input.clientId ?? original.clientId });
}
