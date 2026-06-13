export type SpecialClientWalletEntryType = "deposit" | "payout" | "reversal";

export type SpecialClientWalletEntryTypeFilter = "all" | "deposit" | "payout" | "reversal";

export type SpecialClient = {
  id: number;
  name: string;
  feeRate: string;
  isActive: boolean;
};

export type SpecialClientWalletEntry = {
  id: number;
  clientId: number;
  clientName: string;
  type: SpecialClientWalletEntryType;
  typeLabel: string;
  entryDate: string;
  usdAmount: string | null;
  usdToRmbRate: string | null;
  grossRmb: string | null;
  feeRate: string | null;
  feeRmb: string | null;
  netCreditRmb: string | null;
  payoutRmb: string | null;
  vendorName: string | null;
  purpose: string | null;
  cashAccountId: number;
  cashAccountName: string;
  cashAccountDelta: string;
  balanceAfterRmb: string;
  profitLedgerId: number | null;
  profitLedgerStatus: string;
  note: string | null;
  createdBy: number;
  operatorName: string | null;
  operatorUsername: string;
  createdAt: string;
  reversedAt: string | null;
  reversedBy: number | null;
  reverseReason: string | null;
  originalEntryId: number | null;
  reversalEntryId: number | null;
  reversalStatus: string;
  canReverse: boolean;
};

export type SpecialClientWalletSummary = {
  balanceRmb: string;
  totalGrossRmb: string;
  totalPayoutRmb: string;
  totalFeeRmb: string;
};

export type SpecialClientWalletFilters = {
  clientId: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  entryType: SpecialClientWalletEntryTypeFilter;
};

export type SpecialClientWalletRmbAccount = {
  id: number;
  name: string;
  holderId: number;
  balance: string;
};

export type SpecialClientWalletQuery = {
  clientId?: number;
  dateFrom?: string;
  dateTo?: string;
  entryType?: SpecialClientWalletEntryTypeFilter;
};

export type SpecialClientWalletData = {
  clients: SpecialClient[];
  entries: SpecialClientWalletEntry[];
  summary: SpecialClientWalletSummary;
  filters: SpecialClientWalletFilters;
  selectedClientId: number | null;
  rmbAccounts: SpecialClientWalletRmbAccount[];
};

export type SpecialClientDepositBody = {
  clientId: number;
  entryDate: string;
  usdAmount?: string;
  usdToRmbRate?: string;
  grossRmb: string;
  feeRate?: string;
  cashAccountId: number;
  note?: string;
};

export type SpecialClientPayoutBody = {
  clientId: number;
  entryDate: string;
  payoutRmb: string;
  vendorName: string;
  cashAccountId: number;
  purpose?: string;
  note?: string;
};

export type SpecialClientReverseBody = {
  entryId: number;
  reverseReason: string;
  clientId?: number;
};
