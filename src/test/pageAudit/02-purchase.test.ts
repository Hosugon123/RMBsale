import { describe, expect, it } from "vitest";
import {
  addPurchase,
  createSeedState,
  payPurchase,
  purchasePayableTwd,
  reverseOperation,
  sortedPayableLedgerWithBalances,
  totals
} from "../../lib/localStore";
import { d } from "../../lib/utils";
import { assertDashboardTotals, sumPayableTwd } from "./_helpers";

/** Part 2／8：買入登記 — 買入、付款、應付流水 */
describe("page audit 2/8 買入登記", () => {
  it("creates purchase with payable and RMB lot", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    const twdBefore = totals(state).twd;
    const rmbBefore = totals(state).rmb;

    addPurchase(state, {
      channelName: "稽核渠道",
      depositAccountId: rmbAccount.id,
      rmbAmount: "1000",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    const purchase = state.purchases[0];
    expect(purchasePayableTwd(purchase)).toBe("4500.00");
    expect(totals(state).rmb).toBe(d(rmbBefore).add("1000").toFixed(2));
    expect(totals(state).twd).toBe(twdBefore);
    expect(sumPayableTwd(state)).toBe("4500.00");
    assertDashboardTotals(state);
  });

  it("partial and full purchase payment update payable ledger and account", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    const twdAccount = state.accounts.find((account) => account.id === 1)!;
    const balanceBefore = twdAccount.balance;

    addPurchase(state, {
      channelName: "付款渠道",
      depositAccountId: rmbAccount.id,
      rmbAmount: "2000",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    const purchase = state.purchases[0];
    payPurchase(state, { purchaseId: purchase.id, accountId: twdAccount.id, amountTwd: "2000" });
    expect(purchasePayableTwd(state.purchases[0])).toBe("7000.00");
    expect(purchase.paymentStatus).toBe("partial");

    payPurchase(state, { purchaseId: purchase.id, accountId: twdAccount.id, amountTwd: "7000" });
    expect(purchasePayableTwd(state.purchases[0])).toBe("0.00");
    expect(purchase.paymentStatus).toBe("paid");
    expect(twdAccount.balance).toBe(d(balanceBefore).sub("9000").toFixed(2));

    const payableRows = sortedPayableLedgerWithBalances(state).filter(
      (entry) => entry.channelId === purchase.channelId
    );
    expect(payableRows.some((entry) => entry.entryType === "應付" && entry.direction === "in")).toBe(true);
    expect(payableRows.some((entry) => entry.entryType === "應付付款" && entry.direction === "out")).toBe(true);
  });

  it("rejects overpay on purchase payment", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    addPurchase(state, {
      channelName: "超付渠道",
      depositAccountId: rmbAccount.id,
      rmbAmount: "100",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    expect(() =>
      payPurchase(state, { purchaseId: state.purchases[0].id, accountId: 1, amountTwd: "500" })
    ).toThrow("付款金額超過應付餘額");
  });

  it("paid-at-creation purchase has zero payable", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    const twdAccount = state.accounts.find((account) => account.id === 1)!;
    const twdBefore = twdAccount.balance;

    addPurchase(state, {
      channelName: "即付渠道",
      depositAccountId: rmbAccount.id,
      paymentAccountId: twdAccount.id,
      rmbAmount: "500",
      exchangeRate: "4.4",
      paymentStatus: "paid"
    });
    expect(purchasePayableTwd(state.purchases[0])).toBe("0.00");
    expect(twdAccount.balance).toBe(d(twdBefore).sub("2200").toFixed(2));
  });

  it("reversing unused purchase clears payable and restores RMB lot", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    const rmbBefore = rmbAccount.balance;
    addPurchase(state, {
      channelName: "作廢渠道",
      depositAccountId: rmbAccount.id,
      rmbAmount: "800",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    const purchase = state.purchases[0];
    reverseOperation(state, { entityType: "purchase", entityId: purchase.id });
    expect(purchase.status).toBe("reversed");
    expect(purchasePayableTwd(purchase)).toBe("0.00");
    expect(rmbAccount.balance).toBe(rmbBefore);
  });
});
