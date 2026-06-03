export type UserRole = 'admin' | 'operator';

export interface User {
  id: number;
  username: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
}

export interface Holder {
  id: number;
  name: string;
  isActive: boolean;
}

export interface Customer {
  id: number;
  name: string;
  isActive: boolean;
  totalReceivablesTwd: number;
}

export interface CashAccount {
  id: number;
  holderId: number;
  name: string;
  currency: 'TWD' | 'RMB';
  balance: number;
  profitBalance: number;
  isActive: boolean;
}

export interface Channel {
  id: number;
  name: string;
  isActive: boolean;
}

export interface PurchaseRecord {
  id: number;
  paymentAccountId: number | null;
  depositAccountId: number | null;
  channelId: number | null;
  rmbAmount: number;
  exchangeRate: number;
  twdCost: number;
  paymentStatus: 'paid' | 'unpaid';
  purchaseDate: string;
  operatorId: number;
}

export interface PendingPayment {
  id: number;
  purchaseRecordId: number;
  amountTwd: number;
  createdAt: string;
  paidAt: string | null;
  isSettled: boolean;
}

export interface FIFOInventory {
  id: number;
  purchaseRecordId: number;
  rmbAmount: number;
  remainingRmb: number;
  unitCostTwd: number;
  exchangeRate: number;
  purchaseDate: string;
  lastUpdated: string;
}

export interface FIFOSalesAllocation {
  id: number;
  fifoInventoryId: number;
  salesRecordId: number;
  allocatedRmb: number;
  allocatedCostTwd: number;
  allocationDate: string;
}

export interface SalesRecord {
  id: number;
  customerId: number;
  rmbAccountId: number | null;
  rmbAmount: number;
  exchangeRate: number;
  twdAmount: number;
  isSettled: boolean;
  createdAt: string;
  operatorId: number;
}

export interface Transaction {
  id: number;
  salesRecordId: number;
  twdAccountId: number;
  amount: number;
  transactionDate: string;
  note: string | null;
}

export interface LedgerEntry {
  id: number;
  entryType: string;
  accountId: number | null;
  amount: number;
  description: string | null;
  entryDate: string;
  operatorId: number;
  profitBefore: number | null;
  profitAfter: number | null;
  profitChange: number | null;
  fromAccountId: number | null;
  toAccountId: number | null;
}

export interface CashLog {
  id: number;
  time: string;
  type: string;
  description: string | null;
  amount: number;
  operatorId: number;
}

export interface DeleteAuditLog {
  id: number;
  tableName: string;
  recordId: number;
  deletedData: string;
  balanceChanges: string | null;
  operationType: string;
  description: string | null;
  operatorId: number | null;
  operatorName: string | null;
  deletedAt: string;
}

export interface ProfitTransaction {
  id: number;
  accountId: number;
  transactionType: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  relatedTransactionId: number | null;
  relatedTransactionType: string | null;
  description: string | null;
  createdAt: string;
  operatorId: number;
}

export interface IndependentBalanceLog {
  id: number;
  type: 'deposit' | 'expense';
  rmbAmount: number;
  feeAmount: number;
  netRmb: number;
  accountId: number;
  operatorId: number;
  createdAt: string;
  note: string | null;
}

export interface AppMeta {
  nextId: Record<string, number>;
  feeProfitTotal: number;
}

export interface AppState {
  users: User[];
  holders: Holder[];
  customers: Customer[];
  cashAccounts: CashAccount[];
  channels: Channel[];
  purchaseRecords: PurchaseRecord[];
  pendingPayments: PendingPayment[];
  fifoInventory: FIFOInventory[];
  fifoSalesAllocations: FIFOSalesAllocation[];
  salesRecords: SalesRecord[];
  transactions: Transaction[];
  ledgerEntries: LedgerEntry[];
  cashLogs: CashLog[];
  deleteAuditLogs: DeleteAuditLog[];
  profitTransactions: ProfitTransaction[];
  independentBalanceLogs: IndependentBalanceLog[];
  meta: AppMeta;
}

export interface StateEnvelope {
  version: number;
  updatedAt: number;
  data: AppState;
}

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
  isAdmin: boolean;
}
