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

export const ALL_BOOTSTRAP_SECTIONS: BootstrapSection[] = [
  "users",
  "holders",
  "accounts",
  "customers",
  "channels",
  "purchases",
  "sales",
  "rmbLots",
  "saleAllocations",
  "ledger"
];

export const REFRESH_PROFILES = {
  sale: ["users", "customers", "channels", "accounts", "sales", "saleAllocations", "rmbLots", "ledger"],
  purchase: ["users", "channels", "accounts", "purchases", "rmbLots", "ledger"],
  settlement: ["users", "customers", "sales", "accounts", "ledger"],
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

export function parseBootstrapSections(raw: unknown): BootstrapSection[] | undefined {
  if (raw == null || raw === "") return undefined;
  const text = Array.isArray(raw) ? raw.join(",") : String(raw);
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const allowed = new Set(ALL_BOOTSTRAP_SECTIONS);
  const sections = parts.filter((part): part is BootstrapSection => allowed.has(part as BootstrapSection));
  return sections.length > 0 ? sections : undefined;
}

export function wantsSection(sections: BootstrapSection[] | undefined, section: BootstrapSection) {
  return !sections || sections.includes(section);
}
