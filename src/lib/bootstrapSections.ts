export type BootstrapSection =
  | "users"
  | "holders"
  | "accounts"
  | "customers"
  | "channels"
  | "purchases"
  | "sales"
  | "rmbLots"
  | "saleAllocations"
  | "ledger";

export const REFRESH_PROFILES = {
  sale: ["users", "customers", "channels", "accounts", "sales", "saleAllocations", "rmbLots", "ledger"],
  purchase: ["users", "channels", "accounts", "purchases", "rmbLots", "ledger"],
  settlement: ["customers", "accounts", "ledger"],
  purchasePay: ["users", "channels", "purchases", "accounts", "ledger"],
  adjustment: ["users", "channels", "accounts", "purchases", "rmbLots", "ledger"],
  transfer: ["users", "accounts", "ledger"],
  holderAdmin: ["holders", "accounts"],
  accountAdmin: ["holders", "accounts"],
  customerAdmin: ["customers"],
  channelAdmin: ["channels", "purchases"],
  userAdmin: ["users"],
  reversal: [
    "users",
    "customers",
    "channels",
    "accounts",
    "purchases",
    "sales",
    "rmbLots",
    "saleAllocations",
    "ledger"
  ]
} as const satisfies Record<string, BootstrapSection[]>;

export type RefreshProfile = keyof typeof REFRESH_PROFILES;
