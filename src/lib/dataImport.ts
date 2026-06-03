import type {
  Account,
  AppState,
  AppUser,
  Channel,
  Customer,
  Holder,
  LedgerEntry,
  Purchase,
  RmbLot,
  Sale,
  SaleAllocation
} from "./types";

/** 可從試算表匯出後匯入的業務資料（不含使用者帳號）。 */
export type BusinessDataImport = {
  holders?: Holder[];
  accounts?: Account[];
  customers?: Customer[];
  channels?: Channel[];
  purchases?: Purchase[];
  sales?: Sale[];
  saleAllocations?: SaleAllocation[];
  rmbLots?: RmbLot[];
  ledger?: LedgerEntry[];
};

function asArray<T>(value: unknown, label: string): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} 必須為陣列`);
  return value as T[];
}

export function parseBusinessImportJson(raw: string): BusinessDataImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JSON 格式無法解析");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("匯入內容必須為 JSON 物件");

  const data = parsed as Record<string, unknown>;
  if (data.users) {
    throw new Error("匯入檔不可包含 users，使用者請在管理後台另行維護");
  }

  return {
    holders: asArray<Holder>(data.holders, "holders"),
    accounts: asArray<Account>(data.accounts, "accounts"),
    customers: asArray<Customer>(data.customers, "customers"),
    channels: asArray<Channel>(data.channels, "channels"),
    purchases: asArray<Purchase>(data.purchases, "purchases"),
    sales: asArray<Sale>(data.sales, "sales"),
    saleAllocations: asArray<SaleAllocation>(data.saleAllocations, "saleAllocations"),
    rmbLots: asArray<RmbLot>(data.rmbLots, "rmbLots"),
    ledger: asArray<LedgerEntry>(data.ledger, "ledger")
  };
}

export function applyBusinessImport(
  sessionUserId: number,
  users: AppUser[],
  payload: BusinessDataImport
): AppState {
  return {
    sessionUserId,
    users,
    holders: payload.holders ?? [],
    accounts: payload.accounts ?? [],
    customers: payload.customers ?? [],
    channels: payload.channels ?? [],
    purchases: payload.purchases ?? [],
    sales: payload.sales ?? [],
    saleAllocations: payload.saleAllocations ?? [],
    rmbLots: payload.rmbLots ?? [],
    ledger: payload.ledger ?? []
  };
}

export function summarizeBusinessImport(payload: BusinessDataImport) {
  return {
    holders: payload.holders?.length ?? 0,
    accounts: payload.accounts?.length ?? 0,
    customers: payload.customers?.length ?? 0,
    channels: payload.channels?.length ?? 0,
    purchases: payload.purchases?.length ?? 0,
    sales: payload.sales?.length ?? 0,
    ledger: payload.ledger?.length ?? 0
  };
}
