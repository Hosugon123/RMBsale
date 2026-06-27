let stateVersion: number | undefined;

export function getStateVersion() {
  return stateVersion;
}

export function setStateVersion(v: number) {
  stateVersion = v;
}

export function clearStateVersion() {
  stateVersion = undefined;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (stateVersion !== undefined && options.method && options.method !== 'GET') {
    headers['X-State-Version'] = String(stateVersion);
  }

  const res = await fetch(`/api/${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 409) {
    const err = new Error(data.error || '資料已被更新，請重新整理');
    (err as Error & { code: string }).code = 'VERSION_CONFLICT';
    throw err;
  }

  if (!res.ok) {
    throw new Error(data.error || `請求失敗 (${res.status})`);
  }

  if (typeof data.version === 'number') {
    stateVersion = data.version;
  }

  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: AuthUser; version: number }>('auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request('auth/logout', { method: 'POST' }),

  me: () => request<{ user: AuthUser; version: number }>('auth/me'),

  dashboard: () => request<DashboardData>('dashboard'),

  salesEntry: (page = 1) =>
    request<SalesEntryData>(`sales-entry?page=${page}`),

  createSale: (body: CreateSaleBody) =>
    request('sales-entry', { method: 'POST', body: JSON.stringify(body) }),

  reverseSale: (saleId: number) =>
    request('sales-entry/reverse', {
      method: 'POST',
      body: JSON.stringify({ saleId }),
    }),

  calculateProfit: (rmbAmount: number, exchangeRate: number) =>
    request<ProfitPreview>('calculate-profit', {
      method: 'POST',
      body: JSON.stringify({ rmbAmount, exchangeRate }),
    }),

  buyIn: (page = 1) => request<BuyInData>(`buy-in?page=${page}`),

  createPurchase: (body: CreatePurchaseBody) =>
    request('buy-in', { method: 'POST', body: JSON.stringify(body) }),

  reversePurchase: (purchaseId: number) =>
    request('buy-in/reverse', {
      method: 'POST',
      body: JSON.stringify({ purchaseId }),
    }),

  channels: () => request<Channel[]>('channels'),
  addChannel: (name: string) =>
    request('channels', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteChannel: (id: number) =>
    request('channels', { method: 'DELETE', body: JSON.stringify({ id }) }),

  customers: () => request<Customer[]>('customers'),
  addCustomer: (name: string) =>
    request('customers', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteCustomer: (id: number) =>
    request('customers/delete', { method: 'POST', body: JSON.stringify({ id }) }),

  cashManagement: () => request<CashManagementData>('cash-management'),

  transactions: (page = 1) =>
    request<{ status: string; data: TransactionsData }>(
      `cash-management/transactions?page=${page}`,
    ),

  cashAccountAction: (body: Record<string, unknown>) =>
    request('cash-management/account', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  settlement: (body: SettlementBody) =>
    request('settlement', { method: 'POST', body: JSON.stringify(body) }),

  settlePending: (body: PendingSettlementBody) =>
    request('settle-pending-payment', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  fifoInventory: () => request<FifoData>('fifo-inventory'),

  independentBalance: () => request<IndependentBalanceData>('independent-balance'),

  independentDeposit: (rmbAmount: number, accountId: number) =>
    request('independent-balance/deposit', {
      method: 'POST',
      body: JSON.stringify({ rmbAmount, accountId }),
    }),

  independentExpense: (amount: number, accountId: number, note?: string) =>
    request('independent-balance/expense', {
      method: 'POST',
      body: JSON.stringify({ amount, accountId, note }),
    }),

  specialClientWallet: (params?: import('./specialClientWalletTypes').SpecialClientWalletQuery) => {
    const search = new URLSearchParams();
    if (params?.clientId) search.set('clientId', String(params.clientId));
    if (params?.dateFrom) search.set('dateFrom', params.dateFrom);
    if (params?.dateTo) search.set('dateTo', params.dateTo);
    if (params?.entryType && params.entryType !== 'all') search.set('entryType', params.entryType);
    const query = search.toString();
    return request<import('./specialClientWalletTypes').SpecialClientWalletData>(
      `special-client-wallet${query ? `?${query}` : ''}`,
    );
  },

  createSpecialClient: (body: import('./specialClientWalletTypes').CreateSpecialClientBody) =>
    request<import('./specialClientWalletTypes').SpecialClientWalletData>('special-client-wallet', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  specialClientDeposit: (body: import('./specialClientWalletTypes').SpecialClientDepositBody) =>
    request<import('./specialClientWalletTypes').SpecialClientWalletData>('special-client-wallet/deposit', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  specialClientPayout: (body: import('./specialClientWalletTypes').SpecialClientPayoutBody) =>
    request<import('./specialClientWalletTypes').SpecialClientWalletData>('special-client-wallet/payout', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  specialClientReverse: (body: import('./specialClientWalletTypes').SpecialClientReverseBody) =>
    request<import('./specialClientWalletTypes').SpecialClientWalletData>('special-client-wallet/reverse', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  users: () => request<UserRow[]>('users'),
  addUser: (username: string, password: string, role: string) =>
    request('users', {
      method: 'POST',
      body: JSON.stringify({ username, password, role }),
    }),
  deleteUser: (userId: number) =>
    request('users/delete', { method: 'POST', body: JSON.stringify({ userId }) }),
};

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  isAdmin: boolean;
}

export interface DashboardData {
  totalTwd: number;
  totalRmb: number;
  totalReceivables: number;
  totalProfitTwd: number;
  recentPurchases: unknown[];
  recentSales: unknown[];
  isAdmin: boolean;
}

export interface Customer {
  id: number;
  name: string;
  isActive: boolean;
  totalReceivablesTwd: number;
}

export interface Channel {
  id: number;
  name: string;
  isActive: boolean;
}

export interface AccountGroup {
  holderId: number;
  holderName: string;
  accounts: { id: number; name: string; balance: number; currency: string }[];
}

export interface SalesEntryData {
  version: number;
  customers: Customer[];
  ownerRmbAccountsGrouped: AccountGroup[];
  recentUnsettledSales: Array<{
    id: number;
    customer: Customer;
    rmbAmount: number;
    twdAmount: number;
    createdAt: string;
    profitInfo: { profitTwd: number; profitMargin: number };
  }>;
  pagination: Pagination;
}

export interface BuyInData {
  version: number;
  channels: Channel[];
  ownerTwdAccountsGrouped: AccountGroup[];
  ownerRmbAccountsGrouped: AccountGroup[];
  recentPurchases: Array<{
    id: number;
    rmbAmount: number;
    exchangeRate: number;
    twdCost: number;
    purchaseDate: string;
    channel?: Channel;
    paymentAccount?: { name: string };
  }>;
  pagination: Pagination;
}

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
  pages: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevNum?: number;
  nextNum?: number;
}

export interface CreateSaleBody {
  customerId?: number;
  customerNameManual?: string;
  rmbAccountId: number;
  rmbAmount: number;
  exchangeRate: number;
}

export interface CreatePurchaseBody {
  paymentAccountId?: number | null;
  depositAccountId: number;
  rmbAmount: number;
  exchangeRate: number;
  channelId?: number | null;
  channelNameManual?: string;
  paymentStatus: 'paid' | 'unpaid';
}

export interface ProfitPreview {
  costTwd: number;
  profitTwd: number;
  profitMargin: number;
  sufficient: boolean;
}

export interface CashManagementData {
  version: number;
  totalTwd: number;
  totalRmb: number;
  totalReceivablesTwd: number;
  customersWithReceivables: Array<{
    id: number;
    name: string;
    totalReceivablesTwd: number;
  }>;
  pendingPayments: Array<{
    id: number;
    purchaseRecordId: number;
    amountTwd: number;
  }>;
  accountsByHolder: AccountGroup[];
  holders: Array<{ id: number; name: string }>;
}

export interface TransactionsData {
  transactions: Array<{
    id: string;
    type: string;
    date: string;
    description: string;
    twdChange: number;
    rmbChange: number;
    operator: string;
    runningTwdBalance: number;
  }>;
  pagination: Pagination;
}

export interface SettlementBody {
  customerId: number;
  amount: number;
  accountId: number;
  note?: string;
}

export interface PendingSettlementBody {
  pendingId: number;
  paymentAccountId: number;
  settlementAmount: number;
  note?: string;
}

export interface FifoData {
  inventoryData: Array<{
    purchaseDate: string;
    channel: string;
    paymentAccount: string | null;
    depositAccount: string | null;
    originalRmb: number;
    remainingRmb: number;
    soldRmb: number;
    unitCostTwd: number;
    exchangeRate: number;
    totalValueTwd: number;
  }>;
  salesWithProfit: Array<{
    customerName: string;
    rmbAmount: number;
    twdAmount: number;
    profitTwd: number;
    profitMargin: number;
  }>;
  totalInventoryRmb: number;
}

export interface IndependentBalanceData {
  rmbAccounts: Array<{
    id: number;
    name: string;
    balance: number;
    holder?: { name: string };
  }>;
  rmbBalance: number;
  feeProfitTotal: number;
  logs: Array<{
    id: number;
    type: string;
    rmbAmount: number;
    feeAmount: number;
    netRmb: number;
    createdAt: string;
  }>;
}

export interface UserRow {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
}

export function formatTwd(n: number) {
  const value = Number.isFinite(n) ? n : 0;
  const rounded = Math.sign(value || 1) * Math.ceil(Math.abs(value));
  return `NT$ ${rounded.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatRmb(n: number) {
  return `¥ ${n.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
