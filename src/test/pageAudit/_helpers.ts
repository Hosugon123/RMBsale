import { expect } from "vitest";
import type { AppState } from "../../lib/types";
import {
  accountFifoRmb,
  purchasePayableTwd,
  sortedReceivableLedgerWithBalances,
  totals
} from "../../lib/localStore";
import { sumPendingReceivable } from "../../lib/receivableDisplay";
import { d } from "../../lib/utils";

export function sumAccountBalances(state: AppState, currency: "TWD" | "RMB") {
  return state.accounts
    .filter((account) => account.currency === currency)
    .reduce((sum, account) => sum.add(account.balance), d(0))
    .toFixed(2);
}

export function sumLotRemainingRmb(state: AppState) {
  return state.rmbLots.reduce((sum, lot) => sum.add(lot.remainingRmb), d(0)).toFixed(2);
}

export function sumPayableTwd(state: AppState) {
  return state.purchases
    .reduce((sum, purchase) => sum.add(purchasePayableTwd(purchase)), d(0))
    .toFixed(2);
}

export function assertDashboardTotals(state: AppState) {
  const summary = totals(state);
  expect(summary.twd).toBe(sumAccountBalances(state, "TWD"));
  expect(summary.rmb).toBe(sumAccountBalances(state, "RMB"));
  expect(summary.receivable).toBe(sumPendingReceivable(state.customers));
  expect(summary.inventory).toBe(sumLotRemainingRmb(state));
}

export function assertCustomerReceivableLedger(state: AppState, customerId: number) {
  const customer = state.customers.find((item) => item.id === customerId);
  expect(customer).toBeTruthy();
  const row = sortedReceivableLedgerWithBalances(state).find(
    (entry) =>
      entry.customerId === customerId &&
      !entry.accountId &&
      (entry.entryType === "應收" || entry.entryType === "收帳" || entry.entryType === "作廢")
  );
  if (!row && customer!.receivableTwd === "0.00") return;
  expect(row?.balanceAfter).toBe(customer!.receivableTwd);
}

export function assertAccountFifoMatchesLots(state: AppState, accountId: number) {
  const fromLots = state.rmbLots
    .filter((lot) => lot.accountId === accountId)
    .reduce((sum, lot) => sum.add(lot.remainingRmb), d(0))
    .toFixed(2);
  expect(accountFifoRmb(state, accountId)).toBe(fromLots);
}

export function topPendingReceivableCustomers(state: AppState, limit = 5) {
  return [...state.customers]
    .filter((customer) => Number(customer.receivableTwd) > 0)
    .sort((a, b) => Number(b.receivableTwd) - Number(a.receivableTwd))
    .slice(0, limit);
}
