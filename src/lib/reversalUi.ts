import type { AppState, LedgerEntry } from "./types";

export type ReversalEntityType = "purchase" | "sale" | "settlement" | "transfer" | "adjustment";

export type ReversalTarget = {
  entityType: ReversalEntityType;
  entityId: number;
  label: string;
};

const SETTLEMENT_TABLES = new Set(["settlement", "settlements"]);

export function getReversalTarget(entry: LedgerEntry): ReversalTarget | null {
  if (entry.isReversal) return null;

  if (
    (entry.relatedTable === "purchase" || entry.relatedTable === "purchases") &&
    entry.relatedId != null
  ) {
    return { entityType: "purchase", entityId: entry.relatedId, label: "作廢買入" };
  }
  if ((entry.relatedTable === "sale" || entry.relatedTable === "售出") && entry.relatedId != null) {
    return { entityType: "sale", entityId: entry.relatedId, label: "作廢售出" };
  }
  if (entry.relatedTable && SETTLEMENT_TABLES.has(entry.relatedTable) && entry.relatedId != null) {
    return { entityType: "settlement", entityId: entry.relatedId, label: "作廢收帳" };
  }
  if ((entry.relatedTable === "transfer" || entry.relatedTable === "內轉") && entry.relatedId != null) {
    return { entityType: "transfer", entityId: entry.relatedId, label: "作廢轉帳" };
  }
  if (
    entry.entryType === "入金" &&
    entry.relatedTable === "入金" &&
    entry.relatedId != null &&
    entry.currency === "RMB"
  ) {
    return { entityType: "purchase", entityId: entry.relatedId, label: "作廢入金" };
  }
  if (entry.accountId && ["入金", "撤資", "分潤"].includes(entry.entryType)) {
    return { entityType: "adjustment", entityId: entry.id, label: "作廢" };
  }
  return null;
}

export function isVoidAnchor(entry: LedgerEntry): boolean {
  const table = entry.relatedTable ?? "";
  if (["purchase", "purchases", "sale", "售出", "transfer", "內轉"].includes(table) || SETTLEMENT_TABLES.has(table)) {
    return Boolean(entry.accountId);
  }
  if (entry.entryType === "入金" && table === "入金") return true;
  if (["撤資", "分潤"].includes(entry.entryType)) return true;
  if (table === "profit") return true;
  return false;
}

export function isOperationVoided(state: AppState, target: ReversalTarget): boolean {
  if (target.entityType === "purchase") {
    const purchase = state.purchases.find((row) => row.id === target.entityId);
    return purchase?.status === "reversed";
  }
  if (target.entityType === "sale") {
    const sale = state.sales.find((row) => row.id === target.entityId);
    return sale?.status === "reversed";
  }
  if (target.entityType === "settlement") {
    return state.ledger.some((row) => row.isReversal && row.reversesLedgerId != null && matchesSettlementGroup(row, target.entityId, state));
  }
  if (target.entityType === "transfer") {
    return state.ledger.some(
      (row) =>
        row.isReversal &&
        (row.relatedTable === "transfer" || row.relatedTable === "內轉") &&
        row.relatedId === target.entityId
    );
  }
  return state.ledger.some((row) => row.isReversal && row.reversesLedgerId === target.entityId);
}

function matchesSettlementGroup(reversal: LedgerEntry, settlementId: number, state: AppState) {
  const original = state.ledger.find((row) => row.id === reversal.reversesLedgerId);
  return original?.relatedId === settlementId && original.relatedTable != null && SETTLEMENT_TABLES.has(original.relatedTable);
}

export function canVoidLedgerEntry(state: AppState, entry: LedgerEntry): ReversalTarget | null {
  if (entry.isReversal || !isVoidAnchor(entry)) return null;
  const target = getReversalTarget(entry);
  if (!target || isOperationVoided(state, target)) return null;
  return target;
}
