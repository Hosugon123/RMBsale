import { describe, expect, it } from "vitest";
import {
  addPurchase,
  addSale,
  addSettlement,
  createOpeningReceivable,
  createSeedState,
  payPurchase,
  purchasePayableTwd,
  reverseOperation,
  sortedPayableLedgerWithBalances,
  sortedReceivableLedgerWithBalances
} from "../../lib/localStore";
import { fmtReceivableBalance } from "../../lib/receivableDisplay";
import {
  assertCustomerReceivableLedger,
  assertDashboardTotals,
  sumPayableTwd
} from "./_helpers";

/** Part 4／8：應收應付 — 待收、待付、收帳超付、作廢 */
describe("page audit 4/8 應收應付", () => {
  it("tracks receivable and payable sides independently", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    addPurchase(state, {
      channelName: "應付稽核",
      depositAccountId: rmbAccount.id,
      rmbAmount: "1000",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    addSale(state, {
      customerName: "應收稽核",
      rmbAccountId: rmbAccount.id,
      rmbAmount: "500",
      exchangeRate: "4.6"
    });
    assertDashboardTotals(state);
    expect(sumPayableTwd(state)).toBe("4500.00");
    expect(state.customers.find((item) => item.name === "應收稽核")?.receivableTwd).toBe("2300.00");
  });

  it("supports opening receivable, overpay, and display label", () => {
    const state = createSeedState();
    createOpeningReceivable(state, { customerName: "應收頁客戶", amountTwd: "10000" });
    const customer = state.customers.find((item) => item.name === "應收頁客戶")!;
    addSettlement(state, { customerId: customer.id, accountId: 1, amountTwd: "50000" });
    expect(customer.receivableTwd).toBe("-40000.00");
    expect(fmtReceivableBalance(customer.receivableTwd)).toBe("多付 NT$ 40,000.00");
    assertCustomerReceivableLedger(state, customer.id);
    assertDashboardTotals(state);
  });

  it("payable ledger reflects partial channel payment", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    addPurchase(state, {
      channelName: "渠道A",
      depositAccountId: rmbAccount.id,
      rmbAmount: "1000",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    const purchase = state.purchases[0];
    payPurchase(state, { purchaseId: purchase.id, accountId: 1, amountTwd: "1500" });
    const row = sortedPayableLedgerWithBalances(state).find(
      (entry) => entry.entryType === "應付付款" && entry.relatedId === purchase.id && !entry.accountId
    );
    expect(row?.balanceAfter).toBe("3000.00");
    expect(purchasePayableTwd(purchase)).toBe("3000.00");
  });

  it("reversing settlement restores receivable ledger balance", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => item.name === "阿明")!;
    addSettlement(state, { customerId: customer.id, accountId: 1, amountTwd: "50000" });
    const entry = state.ledger.find(
      (row) => row.entryType === "收帳" && row.accountId === 1 && !row.isReversal
    );
    reverseOperation(state, { entityType: "settlement", entityId: entry!.relatedId! });
    expect(customer.receivableTwd).toBe("15800.05");
    assertCustomerReceivableLedger(state, customer.id);

    const receivableRows = sortedReceivableLedgerWithBalances(state).filter(
      (row) => row.customerId === customer.id && !row.accountId
    );
    expect(receivableRows.some((row) => row.entryType === "收帳")).toBe(true);
  });
});
