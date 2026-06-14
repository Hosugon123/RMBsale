import { describe, expect, it } from "vitest";
import {
  addSale,
  addSettlement,
  addTransfer,
  createSeedState,
  sortedCashLedgerWithBalances,
  sortedLedgerWithBalances,
  sortedProfitLedgerWithBalances
} from "../../lib/localStore";
import { d } from "../../lib/utils";

/** Part 7／8：現金流水 — 分類、餘額、作廢分組 */
describe("page audit 7/8 現金流水", () => {
  it("account ledger balanceAfter matches current account balance on latest row", () => {
    const state = createSeedState();
    const account = state.accounts.find((item) => item.id === 1)!;
    addSettlement(state, { customerId: 1, accountId: account.id, amountTwd: "1000" });
    const row = sortedLedgerWithBalances(state).find(
      (entry) => entry.accountId === account.id && entry.entryType === "收帳"
    );
    expect(row?.balanceAfter).toBe(account.balance);
  });

  it("cash ledger excludes profit entries but keeps settlements and transfers", () => {
    const state = createSeedState();
    addTransfer(state, { fromAccountId: 1, toAccountId: 3, amount: "100" });
    const cashRows = sortedCashLedgerWithBalances(state);
    expect(cashRows.some((entry) => entry.entryType === "利潤")).toBe(false);
    expect(cashRows.some((entry) => entry.entryType === "內轉" || entry.relatedTable === "內轉")).toBe(true);
  });

  it("profit ledger contains sale profit and profit withdrawals only", () => {
    const state = createSeedState();
    const rows = sortedProfitLedgerWithBalances(state);
    expect(rows.every((entry) => entry.entryType === "利潤" || entry.relatedTable === "profit")).toBe(true);
    expect(rows.some((entry) => entry.entryType === "利潤" && entry.direction === "in")).toBe(true);
  });

  it("settlement appears on both receivable and cash ledgers", () => {
    const state = createSeedState();
    addSettlement(state, { customerId: 1, accountId: 1, amountTwd: "500" });
    const cashRow = sortedCashLedgerWithBalances(state).find(
      (entry) => entry.entryType === "收帳" && entry.accountId === 1
    );
    const receivableRow = sortedCashLedgerWithBalances(state).find(
      (entry) => entry.entryType === "收帳" && entry.customerId === 1
    );
    expect(cashRow?.relatedId).toBe(receivableRow?.relatedId);
    expect(cashRow?.amount).toBe("500.00");
  });

  it("ledger amounts use absolute value with direction", () => {
    const state = createSeedState();
    const sale = state.sales[0];
    const outRow = sortedLedgerWithBalances(state).find(
      (entry) => entry.relatedTable === "sales" && entry.relatedId === sale.id && entry.direction === "out"
    );
    expect(d(outRow?.amount ?? 0).gt(0)).toBe(true);
    expect(outRow?.direction).toBe("out");
  });
});
