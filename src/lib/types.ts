export type Role = "admin" | "operator";
export type Currency = "TWD" | "RMB";

export type PermissionKey =
  | "dashboard"
  | "purchase"
  | "sale"
  | "receivables"
  | "accounts"
  | "transfer"
  | "ledger"
  | "inventory"
  | "admin";

export type UserLevel = "admin" | "operator" | "readonly" | "custom";

export type User = {
  id: number;
  username: string;
  role: Role;
};

export type AppUser = User & {
  displayName: string;
  password: string;
  permissions: PermissionKey[];
  isActive: boolean;
};

export type Holder = {
  id: number;
  name: string;
  isActive: boolean;
};

export type Account = {
  id: number;
  holderId: number;
  holderName: string;
  name: string;
  currency: Currency;
  balance: string;
  profitBalance: string;
  isActive: boolean;
};

export type Customer = {
  id: number;
  name: string;
  receivableTwd: string;
  isActive: boolean;
};

export type Channel = {
  id: number;
  name: string;
  isActive: boolean;
};

export type RmbLot = {
  id: number;
  purchaseId: number;
  accountId: number;
  channelName: string;
  originalRmb: string;
  remainingRmb: string;
  unitCostTwd: string;
  exchangeRate: string;
  createdAt: string;
};

export type Sale = {
  id: number;
  customerId: number;
  customerName: string;
  rmbAccountId: number;
  rmbAmount: string;
  exchangeRate: string;
  twdAmount: string;
  costTwd: string;
  profitTwd: string;
  settlementStatus: "unsettled" | "partial" | "settled";
  operatorName: string;
  createdAt: string;
};

export type SaleAllocation = {
  id: number;
  saleId: number;
  lotId: number;
  purchaseId: number;
  channelName: string;
  allocatedRmb: string;
  unitCostTwd: string;
  costTwd: string;
  createdAt: string;
};

export type Purchase = {
  id: number;
  channelId: number;
  channelName: string;
  paymentAccountId?: number;
  depositAccountId: number;
  rmbAmount: string;
  exchangeRate: string;
  twdCost: string;
  paidTwd: string;
  paymentStatus: "paid" | "unpaid" | "partial";
  operatorName: string;
  createdAt: string;
};

export type LedgerEntry = {
  id: number;
  createdAt: string;
  entryType: string;
  accountId?: number;
  customerId?: number;
  channelId?: number;
  direction: "in" | "out" | "none";
  currency: Currency;
  amount: string;
  description: string;
  operatorName: string;
  relatedTable?: string;
  relatedId?: number;
};

export type AppState = {
  sessionUserId: number;
  users: AppUser[];
  holders: Holder[];
  accounts: Account[];
  customers: Customer[];
  channels: Channel[];
  purchases: Purchase[];
  sales: Sale[];
  saleAllocations: SaleAllocation[];
  rmbLots: RmbLot[];
  ledger: LedgerEntry[];
};
