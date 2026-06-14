import { describe, expect, it } from "vitest";
import {
  addPurchase,
  addSale,
  addSettlement,
  addTransfer,
  createSeedState,
  payPurchase,
  purchasePayableTwd,
  sortedCashLedgerWithBalances,
  sortedPayableLedgerWithBalances,
  sortedReceivableLedgerWithBalances,
  totals
} from "../lib/localStore";
import { d } from "../lib/utils";

describe("accounting integration", () => {
  it("keeps summary receivable aligned with customer balances after sale and settlement", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    const twdAccount = state.accounts.find((account) => account.currency === "TWD")!;

    addSale(state, {
      customerName: "整合客戶",
      rmbAccountId: rmbAccount.id,
      rmbAmount: "1000",
      exchangeRate: "4.6"
    });
    const customer = state.customers.find((item) => item.name === "整合客戶")!;
    expect(customer?.receivableTwd).toBe("4600.00");
    expect(totals(state).receivable).toBe(
      moneySumReceivable(state)
    );

    addSettlement(state, { customerId: customer!.id, accountId: twdAccount.id, amountTwd: "2000" });
    expect(customer!.receivableTwd).toBe("2600.00");
    expect(totals(state).receivable).toBe(moneySumReceivable(state));
  });

  it("tracks payable ledger and channel balance through partial purchase payments", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;

    addPurchase(state, {
      channelName: "整合渠道",
      depositAccountId: rmbAccount.id,
      rmbAmount: "1000",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    const purchase = state.purchases[0];
    expect(purchasePayableTwd(purchase)).toBe("4500.00");

    payPurchase(state, { purchaseId: purchase.id, accountId: 1, amountTwd: "2000" });
    expect(purchasePayableTwd(state.purchases[0])).toBe("2500.00");

    const payableRows = sortedPayableLedgerWithBalances(state).filter(
      (entry) => entry.channelId === purchase.channelId && entry.entryType === "應付"
    );
    const latestIncrease = payableRows.find((entry) => entry.direction === "in");
    expect(latestIncrease?.balanceAfter).toBe("4500.00");

    const latestPayment = sortedPayableLedgerWithBalances(state).find(
      (entry) => entry.entryType === "應付付款" && !entry.accountId && entry.relatedId === purchase.id
    );
    expect(latestPayment?.balanceAfter).toBe("2500.00");
  });

  it("offsets channel payable immediately when purchase is paid at creation", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    const twdAccount = state.accounts.find((account) => account.currency === "TWD")!;

    addPurchase(state, {
      channelName: "即付整合",
      depositAccountId: rmbAccount.id,
      paymentAccountId: twdAccount.id,
      rmbAmount: "500",
      exchangeRate: "4.4",
      paymentStatus: "paid"
    });
    const purchase = state.purchases[0];
    expect(purchasePayableTwd(purchase)).toBe("0.00");

    const channelRows = sortedPayableLedgerWithBalances(state).filter(
      (entry) => entry.relatedId === purchase.id && !entry.accountId
    );
    expect(channelRows.some((entry) => entry.entryType === "應付" && entry.direction === "in")).toBe(true);
    expect(channelRows.some((entry) => entry.entryType === "應付付款" && entry.direction === "out")).toBe(true);
    const payment = channelRows.find((entry) => entry.entryType === "應付付款")!;
    expect(payment?.balanceAfter).toBe("0.00");
  });

  it("includes receivable, payable, and account rows together in cash ledger", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    const twdAccount = state.accounts.find((account) => account.currency === "TWD")!;

    addPurchase(state, {
      channelName: "現金整合渠道",
      depositAccountId: rmbAccount.id,
      rmbAmount: "100",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    addSale(state, {
      customerName: "現金整合客戶",
      rmbAccountId: rmbAccount.id,
      rmbAmount: "100",
      exchangeRate: "4.6"
    });
    const customer = state.customers.find((item) => item.name === "現金整合客戶")!;
    addSettlement(state, { customerId: customer!.id, accountId: twdAccount.id, amountTwd: "100" });

    const cashRows = sortedCashLedgerWithBalances(state);
    expect(cashRows.some((entry) => entry.entryType === "應收")).toBe(true);
    expect(cashRows.some((entry) => entry.entryType === "應付")).toBe(true);
    expect(cashRows.some((entry) => entry.entryType === "收帳" && entry.customerId)).toBe(true);
    expect(cashRows.some((entry) => entry.entryType === "收帳" && entry.accountId)).toBe(true);
    expect(cashRows.some((entry) => entry.entryType === "利潤")).toBe(false);
  });

  it("lists settlement in receivable ledger with customer and account rows", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => Number(item.receivableTwd) > 0)!;
    const twdAccount = state.accounts.find((account) => account.currency === "TWD")!;
    const before = customer.receivableTwd;

    addSettlement(state, { customerId: customer.id, accountId: twdAccount.id, amountTwd: "100" });

    const rows = sortedReceivableLedgerWithBalances(state).filter((entry) => entry.entryType === "收帳");
    const customerRow = rows.find((entry) => entry.customerId === customer.id && !entry.accountId);
    const accountRow = rows.find((entry) => entry.accountId === twdAccount.id);
    expect(customerRow).toBeTruthy();
    expect(accountRow).toBeTruthy();
    expect(customerRow?.relatedId).toBe(accountRow?.relatedId);
    expect(customer.receivableTwd).toBe(
      d(before).sub("100").toDecimalPlaces(2).toFixed(2)
    );
  });

  it("preserves account totals after internal transfer", () => {
    const state = createSeedState();
    const from = state.accounts.find((account) => account.id === 1)!;
    const to = state.accounts.find((account) => account.id === 3)!;
    const twdBefore = totals(state).twd;
    const fromBefore = from.balance;
    const toBefore = to.balance;

    addTransfer(state, { fromAccountId: from.id, toAccountId: to.id, amount: "500" });

    expect(totals(state).twd).toBe(twdBefore);
    expect(from.balance).toBe(d(fromBefore).sub("500").toDecimalPlaces(2).toFixed(2));
    expect(to.balance).toBe(d(toBefore).add("500").toDecimalPlaces(2).toFixed(2));
  });
});

function moneySumReceivable(state: ReturnType<typeof createSeedState>) {
  return state.customers
    .reduce((sum, customer) => {
      const balance = d(customer.receivableTwd);
      return balance.gt(0) ? sum.add(balance) : sum;
    }, d(0))
    .toDecimalPlaces(2)
    .toFixed(2);
}
