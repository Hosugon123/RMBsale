import Decimal from "decimal.js";
import { ALL_PERMISSIONS, deriveRole, LEVEL_PRESETS } from "./permissions";
import { DEPOSIT_CHANNEL, isDepositPurchase } from "./purchaseUtils";
import type { AppState, AppUser, Currency, LedgerEntry, PermissionKey, Purchase, User } from "./types";
import { d, nextId } from "./utils";

const KEY = "rmbsale.demo.state.v3";
const now = () => new Date().toISOString();
let transactionTimestamp: string | null = null;

/** 試算表匯入等批次重播時，指定交易時間戳（ISO）；結束後請傳 null。 */
export function setTransactionTimestamp(iso: string | null) {
  transactionTimestamp = iso;
}

const txNow = () => transactionTimestamp ?? now();
const money = (value: Decimal.Value) => d(value).toDecimalPlaces(2).toFixed(2);
const rate = (value: Decimal.Value) => d(value).toDecimalPlaces(6).toFixed(6);

export function getSessionUser(state: AppState): AppUser | null {
  if (!state.sessionUserId) return null;
  return state.users.find((user) => user.id === state.sessionUserId) ?? null;
}

function currentOperator(state: AppState) {
  const user = getSessionUser(state);
  if (!user) return "未知";
  return user.displayName.trim() || user.username.trim() || "未知";
}

function createAdminUser(): AppUser {
  return {
    id: 1,
    username: "ds6186",
    displayName: "系統管理員",
    password: "1234",
    role: "admin",
    permissions: [...ALL_PERMISSIONS],
    isActive: true
  };
}

function upgradeStoredPermissions(user: AppUser): PermissionKey[] {
  const permissions = [...user.permissions];
  if (user.role === "admin") {
    for (const key of ALL_PERMISSIONS) {
      if (!permissions.includes(key)) permissions.push(key);
    }
    return permissions;
  }
  const operatorKeys = LEVEL_PRESETS.operator.permissions;
  const missingOnlyNewOperatorKeys = operatorKeys.every(
    (key) => key === "specialClientWallet" || permissions.includes(key)
  );
  if (missingOnlyNewOperatorKeys && !permissions.includes("specialClientWallet")) {
    permissions.push("specialClientWallet");
  }
  return permissions;
}

function migrateUsers(legacy: { user?: User; users?: AppUser[]; sessionUserId?: number }): Pick<AppState, "users" | "sessionUserId"> {
  if (legacy.users?.length) {
    const users = legacy.users.map((user) => {
      const base = {
        ...user,
        displayName: user.displayName ?? user.username,
        password: user.password ?? "",
        permissions: user.permissions?.length ? user.permissions : [...ALL_PERMISSIONS],
        isActive: user.isActive ?? true,
        role: user.role ?? deriveRole(user.permissions ?? [])
      };
      return {
        ...base,
        permissions: upgradeStoredPermissions(base),
        role: deriveRole(upgradeStoredPermissions(base))
      };
    });
    const legacyAdmin = users.find((u) => u.username === "admin" && u.role === "admin");
    if (legacyAdmin) {
      legacyAdmin.username = "ds6186";
      legacyAdmin.password = "1234";
    }
    const legacyDs001 = users.find((u) => u.username === "ds001" && u.role === "admin");
    if (legacyDs001) {
      legacyDs001.username = "ds6186";
      legacyDs001.password = "1234";
    }
    return {
      users,
      sessionUserId: legacy.sessionUserId ?? users[0]?.id ?? 1
    };
  }
  const admin = createAdminUser();
  if (legacy.user) {
    admin.username = legacy.user.username;
    admin.role = legacy.user.role;
    admin.permissions =
      legacy.user.role === "admin" ? [...ALL_PERMISSIONS] : [...LEVEL_PRESETS.operator.permissions];
  }
  return { users: [admin], sessionUserId: admin.id };
}

function normalizeState(state: AppState): AppState {
  const fallback = currentOperator(state);
  state.ledger.forEach((entry) => {
    if (!entry.operatorName) entry.operatorName = fallback;
  });
  state.purchases.forEach((purchase) => {
    if (!purchase.operatorName) purchase.operatorName = fallback;
  });
  state.sales.forEach((sale) => {
    if (!sale.operatorName) sale.operatorName = fallback;
  });
  ensureProfitLedgerEntries(state);
  ensureSettlementReceivableEntries(state);
  removeDepositPayableLedger(state);
  ensurePayableLedgerEntries(state);
  reconcileLocalRmbLotInventory(state);
  state.purchases.forEach((purchase) => {
    if (isDepositPurchase(purchase)) return;
    if (purchase.paidTwd == null || purchase.paidTwd === undefined) {
      purchase.paidTwd = purchase.paymentStatus === "paid" ? purchase.twdCost : "0.00";
    }
    if (d(purchase.paidTwd).gte(purchase.twdCost)) {
      purchase.paidTwd = purchase.twdCost;
      purchase.paymentStatus = "paid";
    } else if (d(purchase.paidTwd).gt(0)) {
      purchase.paymentStatus = "partial";
    } else {
      purchase.paymentStatus = "unpaid";
    }
  });
  return state;
}

export function purchasePayableTwd(purchase: Pick<Purchase, "twdCost" | "paidTwd" | "channelName">) {
  if (isDepositPurchase(purchase)) return "0.00";
  return money(Decimal.max(0, d(purchase.twdCost).sub(purchase.paidTwd)));
}

function ensureProfitLedgerEntries(state: AppState) {
  let added = false;
  for (const sale of state.sales) {
    if (d(sale.profitTwd).lte(0)) continue;
    const exists = state.ledger.some(
      (entry) => entry.entryType === "利潤" && entry.relatedTable === "sales" && entry.relatedId === sale.id
    );
    if (exists) continue;
    state.ledger.push({
      id: nextId(state.ledger),
      createdAt: sale.createdAt,
      entryType: "利潤",
      direction: "in",
      currency: "TWD",
      amount: sale.profitTwd,
      description: `${sale.customerName} 售出利潤`,
      operatorName: sale.operatorName,
      relatedTable: "sales",
      relatedId: sale.id
    });
    added = true;
  }
  if (added) saveState(state);
}

function ensureSettlementReceivableEntries(state: AppState) {
  let added = false;
  for (const entry of state.ledger) {
    if (entry.entryType !== "收帳" || !entry.accountId || entry.customerId) continue;
    const hasCustomerSide = state.ledger.some(
      (item) =>
        item.entryType === "收帳" &&
        item.customerId &&
        item.relatedTable === entry.relatedTable &&
        item.relatedId === entry.relatedId
    );
    if (hasCustomerSide) continue;
    const prefix = "收帳：";
    if (!entry.description.startsWith(prefix)) continue;
    const name = entry.description.slice(prefix.length).split("（")[0].trim();
    const customer = state.customers.find((item) => item.name === name);
    if (!customer) continue;
    state.ledger.push({
      id: nextId(state.ledger),
      createdAt: entry.createdAt,
      entryType: "收帳",
      customerId: customer.id,
      direction: "out",
      currency: "TWD",
      amount: entry.amount,
      description: entry.description,
      operatorName: entry.operatorName,
      relatedTable: entry.relatedTable,
      relatedId: entry.relatedId
    });
    added = true;
  }
  if (added) saveState(state);
}

function purchaseLedgerRelatedTables(entry: Pick<LedgerEntry, "relatedTable" | "relatedId">, purchaseId: number) {
  return (
    entry.relatedId === purchaseId &&
    (entry.relatedTable === "purchases" ||
      entry.relatedTable === "買入" ||
      entry.relatedTable === "買入付款" ||
      entry.relatedTable === "應付付款")
  );
}

function removeDepositPayableLedger(state: AppState) {
  const depositPurchaseIds = new Set(state.purchases.filter(isDepositPurchase).map((purchase) => purchase.id));
  if (depositPurchaseIds.size === 0) return;
  const before = state.ledger.length;
  state.ledger = state.ledger.filter((entry) => {
    if (entry.relatedId == null || !depositPurchaseIds.has(entry.relatedId)) return true;
    return entry.entryType !== "應付" && entry.entryType !== "應付付款";
  });
  if (state.ledger.length !== before) saveState(state);
}

function ensurePayableLedgerEntries(state: AppState) {
  let added = false;
  for (const purchase of state.purchases) {
    if (isDepositPurchase(purchase)) continue;
    const hasIncrease = state.ledger.some(
      (entry) =>
        entry.entryType === "應付" &&
        entry.direction === "in" &&
        purchaseLedgerRelatedTables(entry, purchase.id)
    );
    if (!hasIncrease) {
      state.ledger.push({
        id: nextId(state.ledger),
        createdAt: purchase.createdAt,
        entryType: "應付",
        channelId: purchase.channelId,
        direction: "in",
        currency: "TWD",
        amount: purchase.twdCost,
        description: `${purchase.channelName} 應付增加`,
        operatorName: purchase.operatorName,
        relatedTable: "purchases",
        relatedId: purchase.id
      });
      added = true;
    }

    const recordedOut = state.ledger
      .filter(
        (entry) =>
          !entry.accountId &&
          entry.channelId === purchase.channelId &&
          entry.direction === "out" &&
          (entry.entryType === "應付付款" || entry.entryType === "買入付款") &&
          purchaseLedgerRelatedTables(entry, purchase.id)
      )
      .reduce((sum, entry) => sum.add(entry.amount), d(0));
    const needOut = d(purchase.paidTwd);
    if (needOut.gt(recordedOut)) {
      const gap = money(needOut.sub(recordedOut));
      state.ledger.push({
        id: nextId(state.ledger),
        createdAt: purchase.createdAt,
        entryType: "應付付款",
        channelId: purchase.channelId,
        direction: "out",
        currency: "TWD",
        amount: gap,
        description: `支付買入款：${purchase.channelName}`,
        operatorName: purchase.operatorName,
        relatedTable: "purchases",
        relatedId: purchase.id
      });
      added = true;
    }
  }
  if (added) saveState(state);
}

export function createSeedState(): AppState {
  const admin = createAdminUser();
  return {
    sessionUserId: admin.id,
    users: [admin],
    holders: [
      { id: 1, name: "小許", isActive: true },
      { id: 2, name: "團隊帳戶", isActive: true }
    ],
    accounts: [
      { id: 1, holderId: 1, holderName: "小許", name: "台幣現金", currency: "TWD", balance: "120000.00", profitBalance: "0.00", isActive: true },
      { id: 2, holderId: 1, holderName: "小許", name: "人民幣庫存", currency: "RMB", balance: "38000.00", profitBalance: "0.00", isActive: true },
      { id: 3, holderId: 2, holderName: "團隊帳戶", name: "台幣銀行", currency: "TWD", balance: "260000.00", profitBalance: "0.00", isActive: true },
      { id: 4, holderId: 2, holderName: "團隊帳戶", name: "支付寶 RMB", currency: "RMB", balance: "58500.00", profitBalance: "0.00", isActive: true }
    ],
    customers: [
      { id: 1, name: "阿明", receivableTwd: "15800.05", isActive: true },
      { id: 2, name: "老王", receivableTwd: "0.00", isActive: true }
    ],
    channels: [
      { id: 1, name: "交易所 A", isActive: true },
      { id: 2, name: "熟客換匯", isActive: true }
    ],
    purchases: [
      { id: 1, channelId: 1, channelName: "交易所 A", paymentAccountId: 3, depositAccountId: 4, rmbAmount: "62000.00", exchangeRate: "4.420000", twdCost: "274040.00", paidTwd: "274040.00", paymentStatus: "paid", operatorName: "admin", createdAt: now() },
      { id: 2, channelId: 2, channelName: "熟客換匯", paymentAccountId: 1, depositAccountId: 2, rmbAmount: "38000.00", exchangeRate: "4.390000", twdCost: "166820.00", paidTwd: "166820.00", paymentStatus: "paid", operatorName: "admin", createdAt: now() }
    ],
    sales: [
      { id: 1, customerId: 1, customerName: "阿明", rmbAccountId: 4, rmbAmount: "3500.00", exchangeRate: "4.514300", twdAmount: "15800.05", costTwd: "15470.00", profitTwd: "330.05", settlementStatus: "unsettled", operatorName: "admin", createdAt: now() }
    ],
    saleAllocations: [
      { id: 1, saleId: 1, lotId: 1, purchaseId: 1, channelName: "交易所 A", allocatedRmb: "3500.00", unitCostTwd: "4.420000", costTwd: "15470.00", createdAt: now() }
    ],
    rmbLots: [
      { id: 1, purchaseId: 1, accountId: 4, channelName: "交易所 A", originalRmb: "62000.00", remainingRmb: "58500.00", unitCostTwd: "4.420000", exchangeRate: "4.420000", createdAt: now() },
      { id: 2, purchaseId: 2, accountId: 2, channelName: "熟客換匯", originalRmb: "38000.00", remainingRmb: "38000.00", unitCostTwd: "4.390000", exchangeRate: "4.390000", createdAt: now() }
    ],
    ledger: [
      { id: 1, createdAt: now(), entryType: "售出", accountId: 4, customerId: 1, direction: "out", currency: "RMB", amount: "3500.00", description: "售出 RMB 給阿明", operatorName: "admin", relatedTable: "sales", relatedId: 1 },
      { id: 2, createdAt: now(), entryType: "應收", customerId: 1, direction: "in", currency: "TWD", amount: "15800.05", description: "阿明應收增加", operatorName: "admin", relatedTable: "sales", relatedId: 1 },
      { id: 3, createdAt: now(), entryType: "利潤", customerId: 1, direction: "in", currency: "TWD", amount: "330.05", description: "阿明 售出利潤", operatorName: "admin", relatedTable: "sales", relatedId: 1 }
    ]
  };
}

export function loadState(): AppState {
  const raw = window.localStorage.getItem(KEY);
  if (!raw) {
    const seed = createSeedState();
    saveState(seed);
    return seed;
  }
  const parsed = JSON.parse(raw) as AppState & { user?: User };
  const hadLegacyAdmin = parsed.users?.some((u) => u.username === "admin" && u.role === "admin");
  const migrated = migrateUsers(parsed);
  const state = { ...parsed, ...migrated } as AppState;
  delete (state as { user?: User }).user;
  if (!state.saleAllocations) {
    state.saleAllocations = inferSaleAllocations(state);
  }
  const normalized = normalizeState(state);
  if (hadLegacyAdmin) saveState(normalized);
  return normalized;
}

export function createUser(
  state: AppState,
  input: {
    username: string;
    password: string;
    displayName: string;
    permissions: PermissionKey[];
  }
) {
  const username = input.username.trim();
  const displayName = input.displayName.trim();
  const password = input.password;
  if (!username) throw new Error("請輸入帳號");
  if (!displayName) throw new Error("請輸入名稱");
  if (password.length < 4) throw new Error("密碼至少 4 碼");
  if (!input.permissions.length) throw new Error("請至少勾選一項權限");
  if (state.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    throw new Error("帳號已存在");
  }

  const user: AppUser = {
    id: nextId(state.users),
    username,
    displayName,
    password,
    permissions: [...input.permissions],
    role: deriveRole(input.permissions),
    isActive: true
  };
  state.users.push(user);
  return user;
}

export function setUserActive(state: AppState, userId: number, isActive: boolean) {
  if (userId === state.sessionUserId && !isActive) throw new Error("無法停用自己的帳號");
  const user = state.users.find((item) => item.id === userId);
  if (!user) throw new Error("找不到使用者");
  user.isActive = isActive;
}

export function updateUser(
  state: AppState,
  userId: number,
  input: {
    username: string;
    password?: string;
    displayName: string;
    permissions: PermissionKey[];
  }
) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) throw new Error("找不到使用者");

  const username = input.username.trim();
  const displayName = input.displayName.trim();
  const password = input.password?.trim() ?? "";

  if (!username) throw new Error("請輸入帳號");
  if (!displayName) throw new Error("請輸入名稱");
  if (password && password.length < 4) throw new Error("密碼至少 4 碼");
  if (!input.permissions.length) throw new Error("請至少勾選一項權限");
  if (state.users.some((item) => item.id !== userId && item.username.toLowerCase() === username.toLowerCase())) {
    throw new Error("帳號已存在");
  }
  if (userId === state.sessionUserId && !input.permissions.includes("admin")) {
    throw new Error("無法移除自己的管理後台權限");
  }

  user.username = username;
  user.displayName = displayName;
  if (password) user.password = password;
  user.permissions = [...input.permissions];
  user.role = deriveRole(input.permissions);
  return user;
}

function getPersistentStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  const globalStorage = (globalThis as { localStorage?: Storage }).localStorage;
  return globalStorage ?? null;
}

export function saveState(state: AppState) {
  const storage = getPersistentStorage();
  if (storage) storage.setItem(KEY, JSON.stringify(state));
}

/** 淺拷貝頂層陣列供 React 更新，避免 structuredClone 整份帳務。 */
export function publishAppStateShallow(state: AppState): AppState {
  return {
    ...state,
    users: [...state.users],
    holders: [...state.holders],
    accounts: state.accounts.map((account) => ({ ...account })),
    customers: state.customers.map((customer) => ({ ...customer })),
    channels: [...state.channels],
    purchases: [...state.purchases],
    sales: [...state.sales],
    saleAllocations: [...state.saleAllocations],
    rmbLots: state.rmbLots.map((lot) => ({ ...lot })),
    ledger: [...state.ledger]
  };
}

let pendingSaveState: AppState | null = null;
let saveStateQueued = false;

/** 延後寫入 localStorage，讓 UI 先結束「處理中」再存檔。 */
export function scheduleSaveState(state: AppState) {
  pendingSaveState = state;
  if (saveStateQueued) return;
  saveStateQueued = true;
  queueMicrotask(() => {
    if (pendingSaveState) saveState(pendingSaveState);
    pendingSaveState = null;
    saveStateQueued = false;
  });
}

export function resetState() {
  const seed = createSeedState();
  saveState(seed);
  return seed;
}

/** 清除所有帳務資料，保留使用者與登入狀態。 */
export function clearBusinessData(state: AppState): AppState {
  const cleared: AppState = {
    sessionUserId: state.sessionUserId,
    users: state.users,
    holders: [],
    accounts: [],
    customers: [],
    channels: [],
    purchases: [],
    sales: [],
    saleAllocations: [],
    rmbLots: [],
    ledger: []
  };
  saveState(cleared);
  return cleared;
}

export function replaceBusinessData(state: AppState, next: AppState): AppState {
  const merged: AppState = {
    sessionUserId: state.sessionUserId,
    users: state.users,
    holders: next.holders,
    accounts: next.accounts,
    customers: next.customers,
    channels: next.channels,
    purchases: next.purchases,
    sales: next.sales,
    saleAllocations: next.saleAllocations ?? [],
    rmbLots: next.rmbLots,
    ledger: next.ledger
  };
  return normalizeState(merged);
}

export function totals(state: AppState) {
  const saleProfitEarned = state.sales.reduce((sum, sale) => sum.add(sale.profitTwd), d(0));
  const openingProfitEarned = state.ledger
    .filter((entry) => entry.relatedTable === "opening_profit" && entry.direction === "in" && entry.currency === "TWD" && !entry.isReversal)
    .reduce((sum, entry) => sum.add(entry.amount), d(0));
  const profitEarned = saleProfitEarned.add(openingProfitEarned);
  const profitWithdrawals = state.ledger
    .filter((entry) => entry.relatedTable === "profit" && entry.direction === "out" && entry.currency === "TWD")
    .reduce((sum, entry) => sum.add(entry.amount), d(0));
  const walletDepositProfitRmb = state.ledger
    .filter(
      (entry) =>
        entry.entryType === "利潤" &&
        entry.relatedTable === "special_client_wallet" &&
        entry.currency === "RMB"
    )
    .reduce(
      (sum, entry) => (entry.direction === "in" ? sum.add(entry.amount) : sum.sub(entry.amount)),
      d(0)
    );

  return {
    twd: state.accounts.filter((a) => a.currency === "TWD").reduce((sum, a) => sum.add(a.balance), d(0)).toFixed(2),
    rmb: state.accounts.filter((a) => a.currency === "RMB").reduce((sum, a) => sum.add(a.balance), d(0)).toFixed(2),
    receivable: state.customers
      .reduce((sum, c) => {
        const balance = d(c.receivableTwd);
        return balance.gt(0) ? sum.add(balance) : sum;
      }, d(0))
      .toFixed(2),
    inventory: state.rmbLots.reduce((sum, lot) => sum.add(lot.remainingRmb), d(0)).toFixed(2),
    profitEarned: profitEarned.toFixed(2),
    profit: profitEarned.sub(profitWithdrawals).toFixed(2),
    walletDepositProfitRmb: walletDepositProfitRmb.toFixed(2)
  };
}

export type LedgerBalanceContext = {
  /** 戶名：帳戶為持有人／帳戶名、應收為客戶名、應付為渠道名 */
  subjectLabel?: string;
  balanceBefore: string;
  balanceAfter: string;
  balanceCurrency: Currency;
};

export function ledgerWithBalances(state: AppState): Array<LedgerEntry & Partial<LedgerBalanceContext>> {
  const accountBalances = new Map(state.accounts.map((account) => [account.id, d(account.balance)]));
  const customerReceivables = new Map(state.customers.map((customer) => [customer.id, d(customer.receivableTwd)]));
  const accountById = new Map(state.accounts.map((account) => [account.id, account]));
  const customerById = new Map(state.customers.map((customer) => [customer.id, customer]));
  const channelById = new Map(state.channels.map((channel) => [channel.id, channel]));
  const channelPayables = new Map(
    state.channels.map((channel) => [
      channel.id,
      state.purchases
        .filter((purchase) => purchase.channelId === channel.id)
        .reduce((sum, purchase) => sum.add(purchasePayableTwd(purchase)), d(0))
    ])
  );
  const purchaseById = new Map(state.purchases.map((purchase) => [purchase.id, purchase]));
  const contextById = new Map<number, LedgerBalanceContext>();
  let profitPool = d(totals(state).profit);

  const resolvePayableChannelId = (entry: LedgerEntry) => {
    if (entry.channelId !== undefined) return entry.channelId;
    if (entry.accountId !== undefined) return undefined;
    if (entry.relatedId == null) return undefined;
    if (entry.relatedTable !== "purchases" && entry.relatedTable !== "purchase") return undefined;
    if (entry.entryType !== "應付" && entry.entryType !== "應付付款") return undefined;
    return purchaseById.get(entry.relatedId)?.channelId;
  };

  const sorted = [...state.ledger].sort((a, b) => {
    const byTime = b.createdAt.localeCompare(a.createdAt);
    return byTime !== 0 ? byTime : b.id - a.id;
  });

  for (const entry of sorted) {
    const delta =
      entry.direction === "in" ? d(entry.amount) : entry.direction === "out" ? d(entry.amount).neg() : d(0);

    if (entry.accountId) {
      const account = accountById.get(entry.accountId);
      if (!account) continue;
      const after = accountBalances.get(entry.accountId)!;
      const before = after.sub(delta);
      contextById.set(entry.id, {
        subjectLabel: `${account.holderName} / ${account.name}`,
        balanceBefore: money(before),
        balanceAfter: money(after),
        balanceCurrency: account.currency
      });
      accountBalances.set(entry.accountId, before);
      continue;
    }

    if (entry.customerId && (entry.entryType === "應收" || entry.entryType === "收帳")) {
      const customer = customerById.get(entry.customerId);
      if (!customer) continue;
      const after = customerReceivables.get(entry.customerId)!;
      const before = after.sub(delta);
      contextById.set(entry.id, {
        subjectLabel: customer.name,
        balanceBefore: money(before),
        balanceAfter: money(after),
        balanceCurrency: "TWD"
      });
      customerReceivables.set(entry.customerId, before);
      continue;
    }

    if (entry.customerId && entry.entryType === "刪除客戶") {
      const customer = customerById.get(entry.customerId);
      if (!customer) continue;
      contextById.set(entry.id, {
        subjectLabel: customer.name,
        balanceBefore: customer.receivableTwd,
        balanceAfter: customer.receivableTwd,
        balanceCurrency: "TWD"
      });
      continue;
    }

    const payableChannelId = resolvePayableChannelId(entry);
    if (payableChannelId !== undefined && (entry.entryType === "應付" || entry.entryType === "應付付款")) {
      const channel = channelById.get(payableChannelId);
      if (!channel) continue;
      const after = channelPayables.get(payableChannelId)!;
      const before = after.sub(delta);
      contextById.set(entry.id, {
        subjectLabel: channel.name,
        balanceBefore: money(before),
        balanceAfter: money(after),
        balanceCurrency: "TWD"
      });
      channelPayables.set(payableChannelId, before);
      continue;
    }

    if (entry.entryType === "利潤" && entry.direction === "in") {
      const after = profitPool;
      const before = after.sub(entry.amount);
      contextById.set(entry.id, {
        subjectLabel: "累計利潤",
        balanceBefore: money(before),
        balanceAfter: money(after),
        balanceCurrency: "TWD"
      });
      profitPool = before;
      continue;
    }

    if (entry.relatedTable === "profit" && entry.direction === "out" && entry.currency === "TWD") {
      const after = profitPool;
      const before = after.add(entry.amount);
      contextById.set(entry.id, {
        subjectLabel: "累計利潤",
        balanceBefore: money(before),
        balanceAfter: money(after),
        balanceCurrency: "TWD"
      });
      profitPool = before;
    }
  }

  return state.ledger.map((entry) => ({
    ...entry,
    ...contextById.get(entry.id)
  }));
}

export function sortedLedgerWithBalances(state: AppState) {
  return [...ledgerWithBalances(state)].sort((a, b) => {
    const byTime = b.createdAt.localeCompare(a.createdAt);
    return byTime !== 0 ? byTime : b.id - a.id;
  });
}

export function isProfitLedgerEntry(
  entry: Pick<LedgerEntry, "entryType" | "direction" | "relatedTable" | "currency" | "description">
) {
  return (
    entry.entryType === "利潤" ||
    entry.entryType === "分潤" ||
    (entry.relatedTable === "profit" && entry.direction === "out" && entry.currency === "TWD") ||
    entry.description.includes("利潤")
  );
}

export function sortedProfitLedgerWithBalances(state: AppState) {
  return sortedLedgerWithBalances(state).filter(isProfitLedgerEntry);
}

/** 完整帳務流水（含帳戶、應收、應付、買入、收帳等），僅排除利潤專區列。 */
export function sortedCashLedgerWithBalances(state: AppState) {
  return sortedLedgerWithBalances(state).filter((entry) => !isProfitLedgerEntry(entry));
}

export function isReceivableLedgerEntry(
  entry: Pick<LedgerEntry, "customerId" | "entryType" | "relatedTable" | "relatedId" | "accountId">
) {
  if (entry.entryType === "利潤" || entry.entryType === "售出") return false;
  if (entry.customerId !== undefined && (entry.entryType === "應收" || entry.entryType === "收帳")) {
    return true;
  }
  if (entry.customerId !== undefined && entry.entryType === "刪除客戶") {
    return true;
  }
  if (
    entry.entryType === "收帳" &&
    entry.accountId !== undefined &&
    (entry.relatedTable === "settlements" ||
      entry.relatedTable === "settlement" ||
      entry.relatedTable === "收帳")
  ) {
    return true;
  }
  return entry.entryType === "應收";
}

export function sortedReceivableLedgerWithBalances(state: AppState) {
  return sortedLedgerWithBalances(state).filter(isReceivableLedgerEntry);
}

export function isPayableLedgerEntry(
  entry: Pick<LedgerEntry, "entryType" | "relatedTable" | "channelId" | "currency" | "direction" | "description">
) {
  if (entry.channelId !== undefined && (entry.entryType === "應付" || entry.entryType === "應付付款")) {
    return true;
  }
  if (entry.entryType === "應付" || entry.entryType === "應付付款" || entry.entryType === "買入付款") {
    return true;
  }
  if (
    entry.relatedTable === "purchase" &&
    entry.currency === "TWD" &&
    entry.direction === "out" &&
    (entry.description.startsWith("支付買入款") || entry.description.startsWith("支付買入成本"))
  ) {
    return true;
  }
  return false;
}

export function sortedPayableLedgerWithBalances(state: AppState) {
  return sortedLedgerWithBalances(state).filter(isPayableLedgerEntry);
}

/** 同一筆業務操作的多筆流水共用此 key（例如售出、收帳、買入、內轉）。 */
export function ledgerOperationGroupKey(
  entry: Pick<LedgerEntry, "relatedTable" | "relatedId">
): string | null {
  if (entry.relatedTable == null || entry.relatedId == null) return null;
  return `${entry.relatedTable}:${entry.relatedId}`;
}

export function profitLedger(state: AppState) {
  return state.ledger
    .filter(
      (entry) =>
        (entry.entryType === "利潤" && entry.direction === "in") ||
        (entry.relatedTable === "profit" && entry.direction === "out" && entry.currency === "TWD")
    )
    .map((entry) => ({
      id: `ledger-${entry.id}`,
      createdAt: entry.createdAt,
      direction: entry.direction,
      amount: entry.amount,
      description: entry.description,
      operatorName: entry.operatorName
    }))
    .sort((a, b) => {
      const byTime = b.createdAt.localeCompare(a.createdAt);
      if (byTime !== 0) return byTime;
      if (a.direction !== b.direction) return a.direction === "out" ? -1 : 1;
      return String(a.id).localeCompare(String(b.id));
    });
}

export type CashflowRow = {
  id: string | number;
  createdAt: string;
  entryType: string;
  currency: Currency;
  direction: "in" | "out" | "none";
  amount: string;
  description: string;
  operatorName: string;
};

export function recentCashflowEntries(state: AppState): CashflowRow[] {
  return state.ledger
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      entryType: entry.entryType,
      currency: entry.currency,
      direction: entry.direction,
      amount: entry.amount,
      description: entry.description,
      operatorName: entry.operatorName
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addPurchase(state: AppState, input: {
  channelName: string;
  paymentAccountId?: number;
  depositAccountId: number;
  rmbAmount: string;
  exchangeRate: string;
  paymentStatus: "paid" | "unpaid";
}) {
  const channel = getOrCreateByName(state.channels, input.channelName);
  const rmbAmount = money(input.rmbAmount);
  const twdCost = money(d(input.rmbAmount).mul(input.exchangeRate));
  const purchase = {
    id: nextId(state.purchases),
    channelId: channel.id,
    channelName: channel.name,
    paymentAccountId: input.paymentAccountId,
    depositAccountId: input.depositAccountId,
    rmbAmount,
    exchangeRate: rate(input.exchangeRate),
    twdCost,
    paidTwd: input.paymentStatus === "paid" ? twdCost : "0.00",
    paymentStatus: input.paymentStatus,
    operatorName: currentOperator(state),
    createdAt: txNow()
  };
  state.purchases.unshift(purchase);
  state.rmbLots.push({
    id: nextId(state.rmbLots),
    purchaseId: purchase.id,
    accountId: input.depositAccountId,
    channelName: channel.name,
    originalRmb: rmbAmount,
    remainingRmb: rmbAmount,
    unitCostTwd: rate(d(twdCost).div(rmbAmount)),
    exchangeRate: rate(input.exchangeRate),
    createdAt: purchase.createdAt
  });
  addLedger(state, {
    entryType: "應付",
    channelId: channel.id,
    direction: "in",
    currency: "TWD",
    amount: twdCost,
    description: `${channel.name} 應付增加`,
    relatedTable: "purchases",
    relatedId: purchase.id
  });
  mutateAccount(
    state,
    input.depositAccountId,
    "RMB",
    rmbAmount,
    "in",
    "purchases",
    purchase.id,
    `買入 ${rmbAmount} RMB`,
    "買入"
  );
  if (input.paymentStatus === "paid" && input.paymentAccountId) {
    addLedger(state, {
      entryType: "應付付款",
      channelId: channel.id,
      direction: "out",
      currency: "TWD",
      amount: twdCost,
      description: `支付買入款：${channel.name}`,
      relatedTable: "purchases",
      relatedId: purchase.id
    });
    mutateAccount(
      state,
      input.paymentAccountId,
      "TWD",
      d(twdCost).neg().toFixed(2),
      "out",
      "purchases",
      purchase.id,
      `支付買入成本 ${twdCost} TWD`,
      "買入付款"
    );
  }
  return state;
}

export function addSale(state: AppState, input: { customerName: string; rmbAccountId: number; rmbAmount: string; exchangeRate: string }) {
  const customer = getOrCreateByName(state.customers, input.customerName, { receivableTwd: "0.00" });
  const twdAmount = money(d(input.rmbAmount).mul(input.exchangeRate));
  const saleId = nextId(state.sales);
  const allocation = consumeRmbLotsStrict(state, input.rmbAccountId, input.rmbAmount);
  const profitTwd = money(d(twdAmount).sub(allocation.costTwd));
  const sale = {
    id: saleId,
    customerId: customer.id,
    customerName: customer.name,
    rmbAccountId: input.rmbAccountId,
    rmbAmount: money(input.rmbAmount),
    exchangeRate: rate(input.exchangeRate),
    twdAmount,
    costTwd: money(allocation.costTwd),
    profitTwd,
    settlementStatus: "unsettled" as const,
    operatorName: currentOperator(state),
    createdAt: txNow()
  };
  state.sales.unshift(sale);
  allocation.items.forEach((item) => {
    state.saleAllocations.push({
      id: nextId(state.saleAllocations),
      saleId,
      ...item,
      createdAt: sale.createdAt
    });
  });
  customer.receivableTwd = money(d(customer.receivableTwd).add(twdAmount));
  mutateAccount(state, input.rmbAccountId, "RMB", d(input.rmbAmount).neg().toFixed(2), "out", "售出", sale.id, `售出 RMB 給${customer.name}`);
  addLedger(state, { entryType: "應收", customerId: customer.id, direction: "in", currency: "TWD", amount: twdAmount, description: `${customer.name} 應收增加`, relatedTable: "sales", relatedId: sale.id });
  if (d(profitTwd).gt(0)) {
    addLedger(state, {
      entryType: "利潤",
      customerId: customer.id,
      direction: "in",
      currency: "TWD",
      amount: profitTwd,
      description: `${customer.name} 售出利潤`,
      relatedTable: "sales",
      relatedId: sale.id
    });
  }
  return state;
}

export function updateSaleProfit(state: AppState, input: { saleId: number; profitTwd: string }) {
  const sale = state.sales.find((item) => item.id === input.saleId && item.status !== "reversed");
  if (!sale) throw new Error("找不到售出紀錄");
  if (!input.profitTwd.trim()) throw new Error("請輸入利潤");
  if (d(input.profitTwd).lt(0)) throw new Error("利潤不可小於 0");

  const profitTwd = money(input.profitTwd);
  sale.profitTwd = profitTwd;

  const existing = state.ledger.find(
    (entry) =>
      entry.entryType === "利潤" &&
      entry.relatedTable === "sales" &&
      entry.relatedId === sale.id &&
      !entry.isReversal
  );

  if (d(profitTwd).lte(0)) {
    if (existing) state.ledger = state.ledger.filter((entry) => entry.id !== existing.id);
    return state;
  }

  if (existing) {
    existing.customerId = sale.customerId;
    existing.amount = profitTwd;
    existing.description = `${sale.customerName} 售出利潤`;
    existing.operatorName = currentOperator(state);
    return state;
  }

  addLedger(state, {
    entryType: "利潤",
    customerId: sale.customerId,
    direction: "in",
    currency: "TWD",
    amount: profitTwd,
    description: `${sale.customerName} 售出利潤`,
    relatedTable: "sales",
    relatedId: sale.id
  });
  return state;
}

export function addSettlement(state: AppState, input: { customerId: number; accountId: number; amountTwd: string; note?: string }) {
  const customer = state.customers.find((item) => item.id === input.customerId);
  if (!customer) throw new Error("找不到客戶");
  if (d(input.amountTwd).lte(0)) throw new Error("金額必須大於 0");

  const amountTwd = money(input.amountTwd);
  const settlementId = nextId(state.ledger);
  const note = input.note?.trim();
  const nextReceivable = d(customer.receivableTwd).sub(amountTwd);
  const description =
    nextReceivable.lt(0) && note
      ? `收帳：${customer.name}（${note}｜多付 ${money(nextReceivable.abs())}）`
      : nextReceivable.lt(0)
        ? `收帳：${customer.name}（多付 ${money(nextReceivable.abs())}）`
        : note
          ? `收帳：${customer.name}（${note}）`
          : `收帳：${customer.name}`;

  customer.receivableTwd = money(nextReceivable);
  addLedger(state, {
    entryType: "收帳",
    customerId: customer.id,
    direction: "out",
    currency: "TWD",
    amount: amountTwd,
    description,
    relatedTable: "settlements",
    relatedId: settlementId
  });
  mutateAccount(state, input.accountId, "TWD", amountTwd, "in", "settlements", settlementId, description, "收帳");
  state.sales.filter((sale) => sale.customerId === customer.id).forEach((sale) => {
    sale.settlementStatus = d(customer.receivableTwd).lte(0) ? "settled" : "partial";
  });
  return state;
}

export function createOpeningReceivable(state: AppState, input: { customerName: string; amountTwd: string; note?: string }) {
  const customerName = input.customerName.trim();
  if (!customerName) throw new Error("請輸入客戶名稱");
  if (!input.amountTwd.trim()) throw new Error("請輸入待收金額");
  if (d(input.amountTwd).lte(0)) throw new Error("待收金額必須大於 0");

  const customer = getOrCreateByName(state.customers, customerName, { receivableTwd: "0.00" });
  const amountTwd = money(input.amountTwd);
  const ledgerId = nextId(state.ledger);
  const note = input.note?.trim();

  customer.isActive = true;
  customer.receivableTwd = money(d(customer.receivableTwd).add(amountTwd));
  state.ledger.unshift({
    id: ledgerId,
    createdAt: txNow(),
    entryType: "應收",
    customerId: customer.id,
    direction: "in",
    currency: "TWD",
    amount: amountTwd,
    description: note ? `期初待收：${customer.name}（${note}）` : `期初待收：${customer.name}`,
    operatorName: currentOperator(state),
    relatedTable: "opening_receivable",
    relatedId: ledgerId
  });

  return state;
}

export function createOpeningProfit(state: AppState, input: { amountTwd: string; note?: string }) {
  if (!input.amountTwd.trim()) throw new Error("請輸入利潤金額");
  if (d(input.amountTwd).lte(0)) throw new Error("利潤金額必須大於 0");

  const amountTwd = money(input.amountTwd);
  const ledgerId = nextId(state.ledger);
  const note = input.note?.trim();

  state.ledger.unshift({
    id: ledgerId,
    createdAt: txNow(),
    entryType: "利潤",
    direction: "in",
    currency: "TWD",
    amount: amountTwd,
    description: note ? `期初利潤（${note}）` : "期初利潤",
    operatorName: currentOperator(state),
    relatedTable: "opening_profit",
    relatedId: ledgerId
  });

  return state;
}

export function payPurchase(state: AppState, input: { purchaseId: number; accountId: number; amountTwd: string }) {
  const purchase = state.purchases.find((item) => item.id === input.purchaseId);
  if (!purchase) throw new Error("找不到買入紀錄");
  if (isDepositPurchase(purchase)) throw new Error("人民幣入金不屬於買入付款，無需登記待付款或已付款");
  const remaining = d(purchase.twdCost).sub(purchase.paidTwd);
  if (remaining.lte(0)) throw new Error("此買入已付清");
  if (d(input.amountTwd).lte(0)) throw new Error("金額必須大於 0");
  if (remaining.lt(input.amountTwd)) throw new Error("付款金額超過應付餘額");

  const amountTwd = money(input.amountTwd);
  purchase.paidTwd = money(d(purchase.paidTwd).add(amountTwd));
  purchase.paymentAccountId = input.accountId;
  if (d(purchase.paidTwd).gte(purchase.twdCost)) {
    purchase.paidTwd = purchase.twdCost;
    purchase.paymentStatus = "paid";
  } else {
    purchase.paymentStatus = "partial";
  }
  addLedger(state, {
    entryType: "應付付款",
    channelId: purchase.channelId,
    direction: "out",
    currency: "TWD",
    amount: amountTwd,
    description: `支付買入款：${purchase.channelName}`,
    relatedTable: "purchases",
    relatedId: purchase.id
  });
  mutateAccount(
    state,
    input.accountId,
    "TWD",
    d(amountTwd).neg().toFixed(2),
    "out",
    "purchases",
    purchase.id,
    `支付買入款：${purchase.channelName}`,
    "應付付款"
  );
  return state;
}

function addRmbDepositLot(
  state: AppState,
  accountId: number,
  rmbAmount: string,
  exchangeRate: string
) {
  const channel = getOrCreateByName(state.channels, DEPOSIT_CHANNEL);
  const twdCost = money(d(rmbAmount).mul(exchangeRate));
  const purchase = {
    id: nextId(state.purchases),
    channelId: channel.id,
    channelName: channel.name,
    depositAccountId: accountId,
    rmbAmount,
    exchangeRate: rate(exchangeRate),
    twdCost,
    paidTwd: "0.00",
    paymentStatus: "paid" as const,
    operatorName: currentOperator(state),
    createdAt: txNow()
  };
  state.purchases.unshift(purchase);
  state.rmbLots.push({
    id: nextId(state.rmbLots),
    purchaseId: purchase.id,
    accountId,
    channelName: channel.name,
    originalRmb: rmbAmount,
    remainingRmb: rmbAmount,
    unitCostTwd: rate(d(twdCost).div(rmbAmount)),
    exchangeRate: rate(exchangeRate),
    createdAt: purchase.createdAt
  });
  return { purchase, twdCost };
}

function consumeRmbLotsStrict(state: AppState, accountId: number, rmbAmount: string) {
  const allocation = allocateLocalFifo(state, accountId, rmbAmount);
  if (d(allocation.shortfallRmb).gt(0)) {
    throw new Error(`RMB 庫存不足，尚缺 ${allocation.shortfallRmb} RMB`);
  }
  return allocation;
}

export function adjustAccount(
  state: AppState,
  input: {
    accountId: number;
    direction: "in" | "out";
    amount: string;
    exchangeRate?: string;
    note?: string;
    withdrawType?: "capital" | "profit";
  }
) {
  const account = state.accounts.find((item) => item.id === input.accountId);
  if (!account) throw new Error("找不到帳戶");
  if (d(input.amount).lte(0)) throw new Error("金額必須大於 0");
  if (input.direction === "out" && input.withdrawType === "profit") {
    if (account.currency !== "TWD") throw new Error("分潤只能從台幣帳戶提取");
    if (d(totals(state).profit).lt(input.amount)) throw new Error("可提取利潤不足");
  }

  const note = input.note?.trim();
  const noteSuffix = note ? `：${note}` : "";

  if (account.currency === "RMB") {
    if (!input.exchangeRate || d(input.exchangeRate).lte(0)) {
      throw new Error("人民幣入出金請填寫匯率");
    }

    if (input.direction === "in") {
      const { purchase, twdCost } = addRmbDepositLot(state, account.id, money(input.amount), rate(input.exchangeRate));
      const description = `${account.holderName} / ${account.name} 入金 @${rate(input.exchangeRate)}，帳面成本 ${twdCost} TWD${noteSuffix}`;
      mutateAccount(state, account.id, "RMB", money(input.amount), "in", "入金", purchase.id, description, "入金");
      saveState(state);
      return state;
    }

    const allocation = consumeRmbLotsStrict(state, account.id, money(input.amount));
    const nominalTwd = money(d(input.amount).mul(input.exchangeRate));
    const description = `${account.holderName} / ${account.name} 撤資 @${rate(input.exchangeRate)}，FIFO 成本 ${allocation.costTwd} TWD，名目 ${nominalTwd} TWD${noteSuffix}`;
    mutateAccount(
      state,
      account.id,
      "RMB",
      d(input.amount).neg().toFixed(2),
      "out",
      "撤資",
      nextId(state.ledger),
      description,
      "撤資"
    );
    saveState(state);
    return state;
  }

  const entryType = input.direction === "in" ? "入金" : input.withdrawType === "profit" ? "分潤" : "撤資";
  const relatedTable = input.direction === "out" && input.withdrawType === "profit" ? "profit" : entryType;
  const amount = input.direction === "in" ? input.amount : d(input.amount).neg().toFixed(2);
  const description = `${account.holderName} / ${account.name} ${entryType}${noteSuffix}`;
  mutateAccount(state, account.id, account.currency, amount, input.direction, relatedTable, nextId(state.ledger), description, entryType);
  saveState(state);
  return state;
}

export function addChannel(state: AppState, input: { name: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("請輸入渠道名稱");
  const existing = state.channels.find((channel) => channel.name === name);
  if (existing) {
    if (existing.isActive) throw new Error("此渠道已存在");
    existing.isActive = true;
    saveState(state);
    return state;
  }
  state.channels.push({
    id: nextId(state.channels),
    name,
    isActive: true
  });
  saveState(state);
  return state;
}

export function renameChannel(state: AppState, input: { channelId: number; name: string }) {
  const channel = state.channels.find((item) => item.id === input.channelId && item.isActive);
  if (!channel) throw new Error("找不到渠道");
  const name = input.name.trim();
  if (!name) throw new Error("請輸入渠道名稱");
  if (state.channels.some((item) => item.id !== channel.id && item.name === name && item.isActive)) {
    throw new Error("此渠道名稱已被使用");
  }
  channel.name = name;
  saveState(state);
  return state;
}

export function setChannelActive(state: AppState, input: { channelId: number; isActive: boolean }) {
  const channel = state.channels.find((item) => item.id === input.channelId);
  if (!channel) throw new Error("找不到渠道");
  channel.isActive = input.isActive;
  saveState(state);
  return state;
}

/** 從常用渠道清單移除；不刪除渠道主檔，亦不影響既有買入與帳務。 */
export function deleteChannel(state: AppState, input: { channelId: number }) {
  const channel = state.channels.find((item) => item.id === input.channelId);
  if (!channel) throw new Error("找不到渠道");
  channel.isActive = false;
  saveState(state);
  return state;
}

export function addCustomer(state: AppState, input: { name: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("請輸入客戶名稱");
  const existing = state.customers.find((customer) => customer.name === name);
  if (existing) {
    if (!existing.isActive) existing.isActive = true;
    saveState(state);
    return state;
  }
  state.customers.push({
    id: nextId(state.customers),
    name,
    receivableTwd: "0.00",
    isActive: true
  });
  saveState(state);
  return state;
}

export function renameCustomer(state: AppState, input: { customerId: number; name: string }) {
  const customer = state.customers.find((item) => item.id === input.customerId && item.isActive);
  if (!customer) throw new Error("找不到客戶");
  const name = input.name.trim();
  if (!name) throw new Error("請輸入客戶名稱");
  if (state.customers.some((item) => item.id !== customer.id && item.name === name && item.isActive)) {
    throw new Error("此客戶名稱已被使用");
  }
  customer.name = name;
  state.sales.forEach((sale) => {
    if (sale.customerId === customer.id) sale.customerName = name;
  });
  saveState(state);
  return state;
}

/** 從常用客戶清單移除；不刪除客戶主檔，亦不影響既有售出、應收與帳務。 */
export function deleteCustomer(state: AppState, input: { customerId: number }) {
  const customer = state.customers.find((item) => item.id === input.customerId);
  if (!customer) throw new Error("找不到客戶");
  customer.isActive = false;
  addLedger(state, {
    entryType: "刪除客戶",
    customerId: customer.id,
    direction: "none",
    currency: "TWD",
    amount: "0.00",
    description: `從常用清單移除：${customer.name}`,
    relatedTable: "customers",
    relatedId: customer.id
  });
  saveState(state);
  return state;
}

export function addHolder(state: AppState, input: { name: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("請輸入持有人名稱");
  if (state.holders.some((holder) => holder.name === name && holder.isActive)) {
    throw new Error("此持有人已存在");
  }

  state.holders.push({
    id: nextId(state.holders),
    name,
    isActive: true
  });
  saveState(state);
  return state;
}

export function renameHolder(state: AppState, input: { holderId: number; name: string }) {
  const holder = state.holders.find((item) => item.id === input.holderId && item.isActive);
  if (!holder) throw new Error("找不到持有者");
  const name = input.name.trim();
  if (!name) throw new Error("請輸入持有人名稱");
  if (state.holders.some((item) => item.id !== holder.id && item.name === name && item.isActive)) {
    throw new Error("此持有人已存在");
  }
  holder.name = name;
  state.accounts
    .filter((account) => account.holderId === holder.id)
    .forEach((account) => {
      account.holderName = name;
    });
  saveState(state);
  return state;
}

export function renameAccount(state: AppState, input: { accountId: number; name: string }) {
  const account = state.accounts.find((item) => item.id === input.accountId && item.isActive);
  if (!account) throw new Error("找不到帳戶");
  const name = input.name.trim();
  if (!name) throw new Error("請輸入帳戶名稱");
  if (
    state.accounts.some(
      (item) =>
        item.id !== account.id &&
        item.holderId === account.holderId &&
        item.name === name &&
        item.currency === account.currency &&
        item.isActive
    )
  ) {
    throw new Error("此持有人已有相同名稱與幣別的帳戶");
  }
  account.name = name;
  saveState(state);
  return state;
}

function assertAccountDeletable(state: AppState, account: AppState["accounts"][number]) {
  if (!d(account.balance).eq(0) || !d(account.profitBalance).eq(0)) {
    throw new Error("帳戶仍有餘額，無法刪除");
  }
  const hasInventory = state.rmbLots.some((lot) => lot.accountId === account.id && d(lot.remainingRmb).gt(0));
  if (hasInventory) {
    throw new Error("帳戶仍有人民幣庫存，無法刪除");
  }
}

export function deleteAccount(state: AppState, input: { accountId: number }) {
  const account = state.accounts.find((item) => item.id === input.accountId && item.isActive);
  if (!account) throw new Error("找不到帳戶");
  assertAccountDeletable(state, account);
  account.isActive = false;
  addLedger(state, {
    entryType: "刪除帳戶",
    accountId: account.id,
    direction: "none",
    currency: account.currency,
    amount: "0.00",
    description: `${account.holderName} / ${account.name} 刪除帳戶`,
    relatedTable: "accounts",
    relatedId: account.id
  });
  saveState(state);
  return state;
}

export function deleteHolder(state: AppState, input: { holderId: number }) {
  const holder = state.holders.find((item) => item.id === input.holderId && item.isActive);
  if (!holder) throw new Error("找不到持有者");
  const activeAccounts = state.accounts.filter((account) => account.holderId === holder.id && account.isActive);
  if (activeAccounts.length > 0) {
    throw new Error("持有人名下仍有帳戶，請先刪除所有帳戶");
  }
  holder.isActive = false;
  saveState(state);
  return state;
}

export function addAccount(state: AppState, input: { holderId: number; name: string; currency: Currency }) {
  const holder = state.holders.find((item) => item.id === input.holderId);
  if (!holder) throw new Error("找不到持有者");
  const name = input.name.trim();
  if (!name) throw new Error("請輸入帳戶名稱");
  const duplicated = state.accounts.some(
    (account) => account.holderId === holder.id && account.name === name && account.currency === input.currency && account.isActive
  );
  if (duplicated) throw new Error("此持有人已有相同名稱與幣別的帳戶");

  state.accounts.push({
    id: nextId(state.accounts),
    holderId: holder.id,
    holderName: holder.name,
    name,
    currency: input.currency,
    balance: "0.00",
    profitBalance: "0.00",
    isActive: true
  });
  saveState(state);
  return state;
}

export function accountFifoRmb(state: AppState, accountId: number): string {
  return money(
    state.rmbLots
      .filter((lot) => lot.accountId === accountId && d(lot.remainingRmb).gt(0))
      .reduce((sum, lot) => sum.add(lot.remainingRmb), d(0))
  );
}

const INVENTORY_SYNC_CHANNEL = "庫存對齊";

function estimateAccountUnitCost(state: AppState, accountId: number): string {
  const lots = state.rmbLots.filter((lot) => lot.accountId === accountId && d(lot.remainingRmb).gt(0));
  if (lots.length) {
    const totalRmb = lots.reduce((sum, lot) => sum.add(lot.remainingRmb), d(0));
    const totalCost = lots.reduce((sum, lot) => sum.add(d(lot.remainingRmb).mul(lot.unitCostTwd)), d(0));
    if (totalRmb.gt(0)) return rate(totalCost.div(totalRmb));
  }
  const recentPurchase = state.purchases.find((purchase) => purchase.depositAccountId === accountId);
  if (recentPurchase) return recentPurchase.exchangeRate;
  return "4.500000";
}

/** 帳戶餘額高於 FIFO 可售量時補批次（庫存盤點／對齊），與 ERP 調整單一致。 */
export function reconcileLocalRmbLotInventory(state: AppState) {
  if (!state.channels.some((channel) => channel.name === INVENTORY_SYNC_CHANNEL)) {
    addChannel(state, { name: INVENTORY_SYNC_CHANNEL });
  }
  const channel = state.channels.find((item) => item.name === INVENTORY_SYNC_CHANNEL)!;
  let added = false;

  for (const account of state.accounts.filter((item) => item.currency === "RMB")) {
    const lotTotal = state.rmbLots
      .filter((lot) => lot.accountId === account.id)
      .reduce((sum, lot) => sum.add(lot.remainingRmb), d(0));
    const gap = d(account.balance).sub(lotTotal);
    if (gap.lte(0.01)) continue;

    const exchangeRate = estimateAccountUnitCost(state, account.id);
    const rmbAmount = money(gap);
    const twdCost = money(gap.mul(exchangeRate));
    const purchaseId = nextId(state.purchases);
    state.purchases.unshift({
      id: purchaseId,
      channelId: channel.id,
      channelName: channel.name,
      depositAccountId: account.id,
      rmbAmount,
      exchangeRate: rate(exchangeRate),
      twdCost,
      paidTwd: twdCost,
      paymentStatus: "paid",
      operatorName: currentOperator(state),
      createdAt: txNow()
    });
    state.rmbLots.push({
      id: nextId(state.rmbLots),
      purchaseId,
      accountId: account.id,
      channelName: channel.name,
      originalRmb: rmbAmount,
      remainingRmb: rmbAmount,
      unitCostTwd: rate(exchangeRate),
      exchangeRate: rate(exchangeRate),
      createdAt: txNow()
    });
    added = true;
  }

  if (added) saveState(state);
}

function transferRmbLots(
  state: AppState,
  input: { fromAccountId: number; toAccountId: number; amount: string; transferId: number }
) {
  let remaining = d(input.amount);
  const lots = state.rmbLots
    .filter((lot) => lot.accountId === input.fromAccountId && d(lot.remainingRmb).gt(0))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const lot of lots) {
    if (remaining.lte(0)) break;
    const available = d(lot.remainingRmb);
    const move = Decimal.min(remaining, available);
    if (move.lte(0)) continue;

    if (move.eq(available)) {
      lot.accountId = input.toAccountId;
      lot.transferId = input.transferId;
    } else {
      lot.remainingRmb = money(available.sub(move));
      state.rmbLots.push({
        id: nextId(state.rmbLots),
        purchaseId: lot.purchaseId,
        accountId: input.toAccountId,
        channelName: lot.channelName,
        originalRmb: money(move),
        remainingRmb: money(move),
        unitCostTwd: lot.unitCostTwd,
        exchangeRate: lot.exchangeRate,
        createdAt: lot.createdAt,
        transferId: input.transferId
      });
    }
    remaining = remaining.sub(move);
  }

  if (remaining.gt(0)) {
    throw new Error(
      `RMB 可轉庫存不足 ${money(remaining)} RMB。帳戶餘額與 FIFO 庫存不一致，請重新整理後再試`
    );
  }
}

function reverseRmbLotTransfer(state: AppState, transferId: number, fromAccountId: number) {
  const movedLots = state.rmbLots.filter((lot) => lot.transferId === transferId);
  if (!movedLots.length) return;

  for (const lot of movedLots) {
    if (d(lot.remainingRmb).lt(lot.originalRmb)) {
      throw new Error("轉帳批次已被售出或動用，無法作廢轉帳");
    }

    const sourceLot = state.rmbLots.find(
      (row) =>
        row.id !== lot.id &&
        row.purchaseId === lot.purchaseId &&
        row.accountId === fromAccountId &&
        row.unitCostTwd === lot.unitCostTwd &&
        row.transferId == null
    );

    if (sourceLot) {
      sourceLot.remainingRmb = money(d(sourceLot.remainingRmb).add(lot.remainingRmb));
      lot.remainingRmb = "0.00";
      lot.transferId = undefined;
    } else {
      lot.accountId = fromAccountId;
      lot.transferId = undefined;
    }
  }

  state.rmbLots = state.rmbLots.filter((lot) => d(lot.remainingRmb).gt(0));
}

export function addTransfer(state: AppState, input: { fromAccountId: number; toAccountId: number; amount: string; note?: string }) {
  const from = state.accounts.find((a) => a.id === input.fromAccountId);
  const to = state.accounts.find((a) => a.id === input.toAccountId);
  if (!from || !to) throw new Error("找不到帳戶");
  if (from.currency !== to.currency) throw new Error("帳戶內轉必須使用相同幣別");
  if (d(input.amount).lte(0)) throw new Error("金額必須大於 0");
  const transferId = nextId(state.ledger);

  if (from.currency === "RMB") {
    transferRmbLots(state, {
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: money(input.amount),
      transferId
    });
  }

  mutateAccount(state, from.id, from.currency, d(input.amount).neg().toFixed(2), "out", "內轉", transferId, `轉出至 ${to.holderName} / ${to.name}`);
  mutateAccount(state, to.id, to.currency, input.amount, "in", "內轉", transferId, `由 ${from.holderName} / ${from.name} 轉入`);
  return state;
}

function getOrCreateByName<T extends { id: number; name: string; isActive: boolean }>(items: T[], name: string, extra?: Partial<T>) {
  const normalized = name.trim();
  const existing = items.find((item) => item.name === normalized);
  if (existing) {
    if (!existing.isActive) existing.isActive = true;
    return existing;
  }
  const item = { id: nextId(items), name: normalized, isActive: true, ...(extra ?? {}) } as T;
  items.push(item);
  return item;
}

function allocateFifoPreview(state: AppState, accountId: number, requestedRmb: string) {
  let remaining = d(requestedRmb);
  let costTwd = d(0);
  const lots = state.rmbLots
    .filter((lot) => lot.accountId === accountId && d(lot.remainingRmb).gt(0))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const lot of lots) {
    if (remaining.lte(0)) break;
    const allocated = Decimal.min(remaining, lot.remainingRmb);
    costTwd = costTwd.add(allocated.mul(lot.unitCostTwd));
    remaining = remaining.sub(allocated);
  }
  return { costTwd: money(costTwd), shortfallRmb: money(remaining) };
}

export function previewSaleProfit(
  state: AppState,
  input: { rmbAccountId: number; rmbAmount: string; exchangeRate: string }
) {
  const rmbAmount = input.rmbAmount.trim();
  const exchangeRate = input.exchangeRate.trim();
  if (!input.rmbAccountId || !rmbAmount || !exchangeRate) return null;
  if (!d(rmbAmount).gt(0) || !d(exchangeRate).gt(0)) return null;

  const twdAmount = money(d(rmbAmount).mul(exchangeRate));
  const { costTwd, shortfallRmb } = allocateFifoPreview(state, input.rmbAccountId, rmbAmount);
  if (d(shortfallRmb).gt(0)) {
    return {
      twdAmount,
      profitTwd: null,
      profitWarning: null,
      profitError: `RMB 庫存不足，尚缺 ${shortfallRmb} RMB`
    };
  }
  return {
    twdAmount,
    profitTwd: money(d(twdAmount).sub(costTwd)),
    profitWarning: null,
    profitError: null as string | null
  };
}

function allocateLocalFifo(state: AppState, accountId: number, requestedRmb: string) {
  let remaining = d(requestedRmb);
  let costTwd = d(0);
  const items: Array<{ lotId: number; purchaseId: number; channelName: string; allocatedRmb: string; unitCostTwd: string; costTwd: string }> = [];
  const lots = state.rmbLots
    .filter((lot) => lot.accountId === accountId && d(lot.remainingRmb).gt(0))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const lot of lots) {
    if (remaining.lte(0)) break;
    const allocated = Decimal.min(remaining, lot.remainingRmb);
    const allocatedCostTwd = allocated.mul(lot.unitCostTwd);
    lot.remainingRmb = money(d(lot.remainingRmb).sub(allocated));
    costTwd = costTwd.add(allocatedCostTwd);
    items.push({
      lotId: lot.id,
      purchaseId: lot.purchaseId,
      channelName: lot.channelName,
      allocatedRmb: money(allocated),
      unitCostTwd: rate(lot.unitCostTwd),
      costTwd: money(allocatedCostTwd)
    });
    remaining = remaining.sub(allocated);
  }
  return { costTwd: money(costTwd), items, shortfallRmb: money(remaining) };
}

function inferSaleAllocations(state: AppState) {
  const soldByLot = state.rmbLots
    .map((lot) => ({
      lot,
      availableSoldRmb: d(lot.originalRmb).sub(lot.remainingRmb)
    }))
    .filter((item) => item.availableSoldRmb.gt(0))
    .sort((a, b) => a.lot.createdAt.localeCompare(b.lot.createdAt));
  const allocations: AppState["saleAllocations"] = [];
  const sales = [...state.sales].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const sale of sales) {
    let remaining = d(sale.rmbAmount);
    for (const item of soldByLot) {
      if (remaining.lte(0)) break;
      if (item.lot.accountId !== sale.rmbAccountId || item.availableSoldRmb.lte(0)) continue;
      const allocated = Decimal.min(remaining, item.availableSoldRmb);
      const costTwd = allocated.mul(item.lot.unitCostTwd);
      allocations.push({
        id: nextId(allocations),
        saleId: sale.id,
        lotId: item.lot.id,
        purchaseId: item.lot.purchaseId,
        channelName: item.lot.channelName,
        allocatedRmb: money(allocated),
        unitCostTwd: rate(item.lot.unitCostTwd),
        costTwd: money(costTwd),
        createdAt: sale.createdAt
      });
      item.availableSoldRmb = item.availableSoldRmb.sub(allocated);
      remaining = remaining.sub(allocated);
    }
  }

  return allocations;
}

function mutateAccount(state: AppState, accountId: number, currency: Currency, amount: string, direction: "in" | "out", relatedTable: string, relatedId: number, description: string, entryType = relatedTable) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("找不到帳戶");
  if (account.currency !== currency) throw new Error("帳戶幣別不符");
  account.balance = money(d(account.balance).add(amount));
  addLedger(state, { entryType, accountId, direction, currency, amount: d(amount).abs().toFixed(2), relatedTable, relatedId, description });
}

function addLedger(state: AppState, input: Omit<LedgerEntry, "id" | "createdAt" | "operatorName">) {
  state.ledger.unshift({
    id: nextId(state.ledger),
    createdAt: txNow(),
    ...input,
    operatorName: currentOperator(state)
  });
}

function reverseAccountLedger(
  state: AppState,
  original: LedgerEntry,
  description: string,
  entryType = "作廢"
) {
  if (!original.accountId) return;
  const account = state.accounts.find((item) => item.id === original.accountId);
  if (!account) throw new Error("找不到帳戶");
  const signed = original.direction === "in" ? d(original.amount).neg() : d(original.amount);
  account.balance = money(d(account.balance).add(signed));
  addLedger(state, {
    entryType,
    accountId: original.accountId,
    direction: original.direction === "in" ? "out" : "in",
    currency: original.currency,
    amount: original.amount,
    relatedTable: original.relatedTable ?? "adjustment",
    relatedId: original.relatedId ?? original.id,
    description,
    isReversal: true,
    reversesLedgerId: original.id
  });
}

export function reverseOperation(
  state: AppState,
  input: { entityType: "purchase" | "sale" | "settlement" | "transfer" | "adjustment" | "specialClientWallet"; entityId: number }
) {
  switch (input.entityType) {
    case "purchase": {
      const purchase = state.purchases.find((row) => row.id === input.entityId);
      if (!purchase || purchase.status === "reversed") throw new Error("找不到買入紀錄或已作廢");
      const lot = state.rmbLots.find((row) => row.purchaseId === purchase.id);
      if (!lot || !d(lot.remainingRmb).eq(lot.originalRmb)) {
        throw new Error("此買入的庫存已被動用，請先作廢相關售出或出金");
      }
      const ledgers = state.ledger.filter(
        (row) =>
          !row.isReversal &&
          row.relatedId === purchase.id &&
          (row.relatedTable === "purchases" || row.relatedTable === "purchase" || row.relatedTable === "入金")
      );
      for (const row of ledgers) reverseAccountLedger(state, row, `作廢買入 #${purchase.id}`, "買入作廢");
      lot.remainingRmb = "0.00";
      purchase.status = "reversed";
      break;
    }
    case "sale": {
      const sale = state.sales.find((row) => row.id === input.entityId);
      if (!sale || sale.status === "reversed") throw new Error("找不到售出紀錄或已作廢");
      if (sale.settlementStatus !== "unsettled") throw new Error("此售出已收款，請先作廢相關收帳");
      for (const alloc of state.saleAllocations.filter((row) => row.saleId === sale.id)) {
        const lot = state.rmbLots.find((row) => row.id === alloc.lotId);
        if (lot) lot.remainingRmb = money(d(lot.remainingRmb).add(alloc.allocatedRmb));
      }
      const customer = state.customers.find((row) => row.id === sale.customerId);
      if (customer) customer.receivableTwd = money(d(customer.receivableTwd).sub(sale.twdAmount));
      const accountLedger = state.ledger.find(
        (row) => row.relatedTable === "售出" && row.relatedId === sale.id && row.accountId && !row.isReversal
      );
      if (accountLedger) reverseAccountLedger(state, accountLedger, `作廢售出 #${sale.id}`, "售出作廢");
      state.ledger
        .filter((row) => !row.isReversal && row.relatedTable === "sales" && row.relatedId === sale.id)
        .forEach((row) => {
          addLedger(state, {
            entryType: "作廢",
            customerId: row.customerId,
            direction: row.direction === "in" ? "out" : "in",
            currency: row.currency,
            amount: row.amount,
            description: `作廢售出應收 #${sale.id}`,
            relatedTable: row.relatedTable,
            relatedId: row.relatedId,
            isReversal: true,
            reversesLedgerId: row.id
          });
        });
      sale.status = "reversed";
      break;
    }
    case "settlement": {
      const anchor = state.ledger.find(
        (row) =>
          !row.isReversal &&
          row.relatedId === input.entityId &&
          (row.relatedTable === "settlements" || row.relatedTable === "settlement") &&
          row.accountId
      );
      if (!anchor) throw new Error("找不到收帳紀錄或已作廢");
      const customer = state.customers.find((row) => row.id === anchor.customerId);
      if (customer) customer.receivableTwd = money(d(customer.receivableTwd).add(anchor.amount));
      state.ledger
        .filter(
          (row) =>
            !row.isReversal &&
            row.relatedId === input.entityId &&
            (row.relatedTable === "settlements" || row.relatedTable === "settlement")
        )
        .forEach((row) => {
          if (row.accountId) {
            reverseAccountLedger(state, row, `作廢收帳 #${input.entityId}`, "收帳作廢");
          } else {
            addLedger(state, {
              entryType: "作廢",
              customerId: row.customerId,
              direction: row.direction === "in" ? "out" : "in",
              currency: row.currency,
              amount: row.amount,
              description: `作廢收帳 #${input.entityId}`,
              relatedTable: row.relatedTable,
              relatedId: row.relatedId,
              isReversal: true,
              reversesLedgerId: row.id
            });
          }
        });
      break;
    }
    case "transfer": {
      const ledgers = state.ledger.filter(
        (row) =>
          !row.isReversal &&
          row.relatedId === input.entityId &&
          (row.relatedTable === "內轉" || row.relatedTable === "transfer") &&
          row.accountId
      );
      if (ledgers.length === 0) throw new Error("找不到轉帳紀錄或已作廢");
      const outLedger = ledgers.find((row) => row.direction === "out");
      if (outLedger?.currency === "RMB" && outLedger.accountId) {
        reverseRmbLotTransfer(state, input.entityId, outLedger.accountId);
      }
      ledgers.forEach((row) => reverseAccountLedger(state, row, `作廢轉帳 #${input.entityId}`, "轉帳作廢"));
      break;
    }
    case "adjustment": {
      const entry = state.ledger.find((row) => row.id === input.entityId);
      if (!entry || entry.isReversal) throw new Error("找不到流水紀錄");
      if (state.ledger.some((row) => row.reversesLedgerId === entry.id)) throw new Error("此筆操作已作廢");
      if (entry.entryType === "入金" && entry.relatedTable === "入金" && entry.relatedId && entry.currency === "RMB") {
        const purchase = state.purchases.find((row) => row.id === entry.relatedId);
        const lot = state.rmbLots.find((row) => row.purchaseId === entry.relatedId);
        if (!purchase || !lot || !d(lot.remainingRmb).eq(lot.originalRmb)) {
          throw new Error("此入金無法作廢，庫存可能已被動用");
        }
        reverseAccountLedger(state, entry, `作廢入金 #${entry.relatedId}`, "入金作廢");
        lot.remainingRmb = "0.00";
        purchase.status = "reversed";
        break;
      }
      if (entry.entryType === "撤資" && entry.currency === "RMB" && entry.direction === "out") {
        const rateMatch = entry.description.match(/@([\d.]+)/);
        const exchangeRate = rateMatch?.[1];
        if (!exchangeRate) throw new Error("無法還原人民幣撤資匯率");
        addRmbDepositLot(state, entry.accountId!, entry.amount, exchangeRate);
      }
      reverseAccountLedger(state, entry, `作廢：${entry.description}`, `${entry.entryType}作廢`);
      break;
    }
    case "specialClientWallet":
      throw new Error("特殊客戶儲值代付請在線上環境沖銷");
    default:
      throw new Error("不支援的作廢類型");
  }
  return state;
}
