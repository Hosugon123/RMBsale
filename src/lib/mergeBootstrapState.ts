import type { AppState } from "./types";

export function mergeBootstrapState(current: AppState, patch: Partial<AppState> & { sessionUserId?: number }): AppState {
  return {
    sessionUserId: patch.sessionUserId ?? current.sessionUserId,
    users: patch.users ?? current.users,
    holders: patch.holders ?? current.holders,
    accounts: patch.accounts ?? current.accounts,
    customers: patch.customers ?? current.customers,
    channels: patch.channels ?? current.channels,
    purchases: patch.purchases ?? current.purchases,
    sales: patch.sales ?? current.sales,
    rmbLots: patch.rmbLots ?? current.rmbLots,
    saleAllocations: patch.saleAllocations ?? current.saleAllocations,
    ledger: patch.ledger ?? current.ledger
  };
}
