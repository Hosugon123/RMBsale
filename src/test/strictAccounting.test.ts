import { describe, expect, it } from "vitest";
import {
  addPurchase,
  addSale,
  addSettlement,
  addTransfer,
  adjustAccount,
  createOpeningReceivable,
  createSeedState,
  payPurchase,
  purchasePayableTwd,
  reverseOperation,
  sortedLedgerWithBalances,
  sortedPayableLedgerWithBalances,
  sortedProfitLedgerWithBalances,
  sortedReceivableLedgerWithBalances,
  totals
} from "../lib/localStore";
import { d } from "../lib/utils";
import {
  assertAccountFifoMatchesLots,
  assertCustomerReceivableLedger,
  assertDashboardTotals,
  sumPayableTwd
} from "./pageAudit/_helpers";

function assertLedgerRowArithmetic(
  row: ReturnType<typeof sortedLedgerWithBalances>[number]
) {
  if (row.balanceBefore == null || row.balanceAfter == null) return;
  const delta =
    row.direction === "in" ? d(row.amount) : row.direction === "out" ? d(row.amount).neg() : d(0);
  expect(d(row.balanceBefore).add(delta).toFixed(2)).toBe(row.balanceAfter);
}

/** 嚴格檢查：摘要、帳戶流水、應收、應付、利潤、FIFO */
export function assertStrictAccounting(state: ReturnType<typeof createSeedState>) {
  assertDashboardTotals(state);

  for (const account of state.accounts) {
    const latest = sortedLedgerWithBalances(state).find(
      (entry) => entry.accountId === account.id && entry.balanceAfter != null
    );
    if (latest) {
      expect(latest.balanceAfter).toBe(account.balance);
      assertLedgerRowArithmetic(latest);
    }
    if (account.currency === "RMB") {
      assertAccountFifoMatchesLots(state, account.id);
    }
  }

  for (const customer of state.customers) {
    if (Number(customer.receivableTwd) !== 0) {
      assertCustomerReceivableLedger(state, customer.id);
    }
  }

  for (const channel of state.channels) {
    const expectedPayable = state.purchases
      .filter((purchase) => purchase.channelId === channel.id)
      .reduce((sum, purchase) => sum.add(purchasePayableTwd(purchase)), d(0))
      .toFixed(2);
    const latest = sortedPayableLedgerWithBalances(state).find(
      (entry) => entry.channelId === channel.id && !entry.accountId && entry.balanceAfter != null
    );
    if (d(expectedPayable).gt(0)) {
      expect(latest?.balanceAfter).toBe(expectedPayable);
    }
  }

  const profitRows = sortedProfitLedgerWithBalances(state).filter((entry) => entry.balanceAfter != null);
  if (profitRows.length > 0) {
    expect(profitRows[0]?.balanceAfter).toBe(totals(state).profit);
  }

  expect(sumPayableTwd(state)).toBe(
    state.purchases.reduce((sum, purchase) => sum.add(purchasePayableTwd(purchase)), d(0)).toFixed(2)
  );

  for (const row of sortedLedgerWithBalances(state)) {
    assertLedgerRowArithmetic(row);
  }

  for (const row of sortedReceivableLedgerWithBalances(state)) {
    if (row.balanceBefore != null && row.balanceAfter != null && !row.accountId) {
      assertLedgerRowArithmetic(row);
    }
  }
}

describe("strict accounting and ledger integrity", () => {
  it("seed state passes strict ledger and summary checks", () => {
    assertStrictAccounting(createSeedState());
  });

  it("full business cycle keeps ledger balances aligned", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    const twdAccount = state.accounts.find((account) => account.id === 1)!;

    createOpeningReceivable(state, { customerName: "嚴格客戶", amountTwd: "5000" });
    addPurchase(state, {
      channelName: "嚴格渠道",
      depositAccountId: rmbAccount.id,
      rmbAmount: "2000",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    assertStrictAccounting(state);

    payPurchase(state, { purchaseId: state.purchases[0].id, accountId: twdAccount.id, amountTwd: "3000" });
    assertStrictAccounting(state);

    addSale(state, {
      customerName: "嚴格客戶",
      rmbAccountId: rmbAccount.id,
      rmbAmount: "800",
      exchangeRate: "4.6"
    });
    assertStrictAccounting(state);

    const customer = state.customers.find((item) => item.name === "嚴格客戶")!;
    addSettlement(state, { customerId: customer.id, accountId: twdAccount.id, amountTwd: "50000" });
    assertStrictAccounting(state);

    addTransfer(state, { fromAccountId: 1, toAccountId: 3, amount: "200" });
    adjustAccount(state, { accountId: 1, direction: "in", amount: "100", note: "補充" });
    assertStrictAccounting(state);
  });

  it("reversal chain restores strict accounting invariants", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => item.name === "阿明")!;
    addSettlement(state, { customerId: customer.id, accountId: 1, amountTwd: "50000" });
    assertStrictAccounting(state);

    const settlementEntry = state.ledger.find(
      (entry) => entry.entryType === "收帳" && entry.accountId === 1 && !entry.isReversal
    );
    reverseOperation(state, { entityType: "settlement", entityId: settlementEntry!.relatedId! });
    assertStrictAccounting(state);

    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    addPurchase(state, {
      channelName: "待作廢",
      depositAccountId: rmbAccount.id,
      rmbAmount: "100",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    const purchase = state.purchases[0];
    reverseOperation(state, { entityType: "purchase", entityId: purchase.id });
    expect(purchasePayableTwd(purchase)).toBe("0.00");
    assertStrictAccounting(state);
  });

  it("settlement paired rows share relatedId and amounts", () => {
    const state = createSeedState();
    addSettlement(state, { customerId: 1, accountId: 1, amountTwd: "1234.56" });
    const rows = sortedReceivableLedgerWithBalances(state).filter((entry) => entry.entryType === "收帳");
    const customerRow = rows.find((entry) => entry.customerId === 1 && !entry.accountId);
    const accountRow = rows.find((entry) => entry.accountId === 1);
    expect(customerRow?.relatedId).toBe(accountRow?.relatedId);
    expect(customerRow?.amount).toBe("1235.00");
    expect(accountRow?.amount).toBe("1235.00");
    expect(customerRow?.direction).toBe("out");
    expect(accountRow?.direction).toBe("in");
    assertStrictAccounting(state);
  });
});
