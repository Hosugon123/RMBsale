import { describe, expect, it } from "vitest";
import {
  addTransfer,
  adjustAccount,
  createSeedState,
  reverseOperation,
  totals
} from "../../lib/localStore";
import { d } from "../../lib/utils";
import { assertAccountFifoMatchesLots, assertDashboardTotals } from "./_helpers";

/** Part 6／8：帳務管理 — 入出金、內轉、分潤、RMB 入金 */
describe("page audit 6/8 帳務管理", () => {
  it("TWD deposit increases account and total TWD", () => {
    const state = createSeedState();
    const account = state.accounts.find((item) => item.id === 1)!;
    const balanceBefore = account.balance;
    const twdBefore = totals(state).twd;
    adjustAccount(state, { accountId: account.id, direction: "in", amount: "1000", note: "測試入金" });
    expect(account.balance).toBe(d(balanceBefore).add("1000").toFixed(2));
    expect(totals(state).twd).toBe(d(twdBefore).add("1000").toFixed(2));
    assertDashboardTotals(state);
  });

  it("profit withdrawal reduces profit pool and account balance", () => {
    const state = createSeedState();
    const account = state.accounts.find((item) => item.id === 1)!;
    const profitBefore = totals(state).profit;
    adjustAccount(state, {
      accountId: account.id,
      direction: "out",
      amount: "100",
      withdrawType: "profit",
      note: "分潤"
    });
    expect(totals(state).profit).toBe(d(profitBefore).sub("100").toFixed(2));
  });

  it("internal transfer preserves total balance per currency", () => {
    const state = createSeedState();
    const from = state.accounts.find((account) => account.id === 1)!;
    const to = state.accounts.find((account) => account.id === 3)!;
    const fromBefore = from.balance;
    const toBefore = to.balance;
    const twdBefore = totals(state).twd;
    addTransfer(state, { fromAccountId: from.id, toAccountId: to.id, amount: "500" });
    expect(totals(state).twd).toBe(twdBefore);
    expect(from.balance).toBe(d(fromBefore).sub("500").toFixed(2));
    expect(to.balance).toBe(d(toBefore).add("500").toFixed(2));
  });

  it("RMB deposit creates lot and increases fifo inventory", () => {
    const state = createSeedState();
    const account = state.accounts.find((account) => account.currency === "RMB")!;
    const inventoryBefore = totals(state).inventory;
    adjustAccount(state, {
      accountId: account.id,
      direction: "in",
      amount: "1000",
      exchangeRate: "4.5",
      note: "RMB入金"
    });
    expect(totals(state).inventory).toBe(d(inventoryBefore).add("1000").toFixed(2));
    assertAccountFifoMatchesLots(state, account.id);
  });

  it("reversing TWD deposit restores account balance", () => {
    const state = createSeedState();
    const account = state.accounts.find((item) => item.id === 1)!;
    const balanceBefore = account.balance;
    adjustAccount(state, { accountId: account.id, direction: "in", amount: "888", note: "待作廢" });
    const entry = state.ledger.find(
      (row) => row.accountId === account.id && row.entryType === "入金" && !row.isReversal
    );
    reverseOperation(state, { entityType: "adjustment", entityId: entry!.relatedId! });
    expect(account.balance).toBe(balanceBefore);
  });
});
