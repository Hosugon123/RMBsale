import type { LedgerEntry } from "./types";

/** 成員帳戶（有 accountId）用收入/支出；應收應付等用增加/減少 */
export function ledgerDirectionLabel(entry: Pick<LedgerEntry, "direction" | "accountId">): string {
  if (entry.direction === "none") return "-";
  if (entry.accountId != null) {
    return entry.direction === "in" ? "收入" : "支出";
  }
  return entry.direction === "in" ? "增加" : "減少";
}
