import { describe, expect, it } from "vitest";
import {
  addSale,
  addSettlement,
  createOpeningReceivable,
  createSeedState,
  reverseOperation,
  sortedReceivableLedgerWithBalances,
  totals
} from "../lib/localStore";
import type { AppState } from "../lib/types";
import { sumPendingReceivable } from "../lib/receivableDisplay";
import { d } from "../lib/utils";

function assertReceivableSummary(state: AppState) {
  expect(totals(state).receivable).toBe(sumPendingReceivable(state.customers));
}

function latestCustomerReceivableRow(state: AppState, customerId: number) {
  return sortedReceivableLedgerWithBalances(state).find(
    (entry) =>
      entry.customerId === customerId &&
      !entry.accountId &&
      (entry.entryType === "應收" || entry.entryType === "收帳" || entry.entryType === "作廢")
  );
}

function assertCustomerLedgerMatchesBalance(state: AppState, customerId: number) {
  const customer = state.customers.find((item) => item.id === customerId);
  expect(customer).toBeTruthy();
  const row = latestCustomerReceivableRow(state, customerId);
  if (!row && customer!.receivableTwd === "0.00") return;
  expect(row?.balanceAfter).toBe(customer!.receivableTwd);
}

function assertAllCustomersConsistent(state: AppState) {
  assertReceivableSummary(state);
  for (const customer of state.customers) {
    if (Number(customer.receivableTwd) !== 0) {
      assertCustomerLedgerMatchesBalance(state, customer.id);
    }
  }
}

function settlementEntityId(state: AppState, accountId: number) {
  const entry = state.ledger.find(
    (row) => row.entryType === "收帳" && row.accountId === accountId && !row.isReversal
  );
  expect(entry?.relatedId).toBeTruthy();
  return entry!.relatedId!;
}

describe("receivable accounting invariants", () => {
  it("keeps ledger balance and summary aligned through opening → sale → partial → full → overpay", () => {
    const state = createSeedState();
    const twdAccount = state.accounts.find((account) => account.id === 1)!;
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    const balanceBefore = twdAccount.balance;

    createOpeningReceivable(state, { customerName: "全流程客戶", amountTwd: "3000", note: "期初" });
    const customer = state.customers.find((item) => item.name === "全流程客戶")!;
    assertAllCustomersConsistent(state);

    addSale(state, {
      customerName: "全流程客戶",
      rmbAccountId: rmbAccount.id,
      rmbAmount: "2000",
      exchangeRate: "4.5"
    });
    expect(customer!.receivableTwd).toBe("12000.00");
    assertAllCustomersConsistent(state);

    addSettlement(state, { customerId: customer!.id, accountId: twdAccount.id, amountTwd: "2000" });
    expect(customer!.receivableTwd).toBe("10000.00");
    expect(state.sales.find((sale) => sale.customerId === customer!.id)?.settlementStatus).toBe("partial");
    assertAllCustomersConsistent(state);

    addSettlement(state, { customerId: customer!.id, accountId: twdAccount.id, amountTwd: "8000" });
    expect(customer!.receivableTwd).toBe("2000.00");
    assertAllCustomersConsistent(state);

    addSettlement(state, { customerId: customer!.id, accountId: twdAccount.id, amountTwd: "5000" });
    expect(customer!.receivableTwd).toBe("-3000.00");
    expect(state.sales.every((sale) => sale.customerId !== customer!.id || sale.settlementStatus === "settled")).toBe(
      true
    );
    expect(twdAccount.balance).toBe(d(balanceBefore).add("15000").toFixed(2));
    assertAllCustomersConsistent(state);
  });

  it("restores partial settlement status when reversing a partial payment", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => item.name === "阿明")!;
    const account = state.accounts.find((item) => item.id === 1)!;

    addSettlement(state, { customerId: customer.id, accountId: account.id, amountTwd: "1000" });
    expect(customer.receivableTwd).toBe("14800.05");
    expect(state.sales[0].settlementStatus).toBe("partial");

    const entityId = settlementEntityId(state, account.id);
    reverseOperation(state, { entityType: "settlement", entityId });

    expect(customer.receivableTwd).toBe("15800.05");
    expect(state.sales[0].settlementStatus).toBe("unsettled");
    assertAllCustomersConsistent(state);
  });

  it("records paired customer/account settlement ledger rows with same relatedId", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => item.name === "阿明")!;
    addSettlement(state, { customerId: customer.id, accountId: 1, amountTwd: "500" });

    const rows = sortedReceivableLedgerWithBalances(state).filter((entry) => entry.entryType === "收帳");
    const customerRow = rows.find((entry) => entry.customerId === customer.id && !entry.accountId);
    const accountRow = rows.find((entry) => entry.accountId === 1);
    expect(customerRow?.relatedId).toBe(accountRow?.relatedId);
    expect(customerRow?.direction).toBe("out");
    expect(accountRow?.direction).toBe("in");
    expect(customerRow?.amount).toBe("500.00");
    expect(accountRow?.amount).toBe("500.00");
  });

  it("handles multiple sales with cumulative settlement and reversal", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    const twdAccount = state.accounts.find((account) => account.id === 1)!;

    addSale(state, {
      customerName: "阿明",
      rmbAccountId: rmbAccount.id,
      rmbAmount: "1000",
      exchangeRate: "4.5"
    });
    const customer = state.customers.find((item) => item.name === "阿明")!;
    expect(customer!.receivableTwd).toBe("20300.05");

    addSettlement(state, { customerId: customer!.id, accountId: twdAccount.id, amountTwd: "20300.05" });
    expect(customer!.receivableTwd).toBe("0.00");
    expect(state.sales.every((sale) => sale.customerId !== customer!.id || sale.settlementStatus === "settled")).toBe(
      true
    );

    const entityId = settlementEntityId(state, twdAccount.id);
    reverseOperation(state, { entityType: "settlement", entityId });
    expect(customer!.receivableTwd).toBe("20300.05");
    expect(
      state.sales.filter((sale) => sale.customerId === customer!.id).every((sale) => sale.settlementStatus === "unsettled")
    ).toBe(true);
    assertAllCustomersConsistent(state);
  });

  it("marks all sales settled when customer net balance stays overpaid after new sale", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => item.name === "阿明")!;
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;

    addSettlement(state, { customerId: customer.id, accountId: 1, amountTwd: "50000" });
    expect(customer.receivableTwd).toBe("-34199.95");

    addSale(state, {
      customerName: "阿明",
      rmbAccountId: rmbAccount.id,
      rmbAmount: "1000",
      exchangeRate: "4.5"
    });
    expect(customer.receivableTwd).toBe("-29699.95");
    const activeSales = state.sales.filter((sale) => sale.customerId === customer.id && sale.status !== "reversed");
    expect(activeSales.every((sale) => sale.settlementStatus === "settled")).toBe(true);
    assertAllCustomersConsistent(state);
  });

  it("rejects sale reversal when receivable was collected", () => {
    const state = createSeedState();
    const sale = state.sales[0];
    addSettlement(state, { customerId: sale.customerId, accountId: 1, amountTwd: "1000" });
    expect(() => reverseOperation(state, { entityType: "sale", entityId: sale.id })).toThrow(
      "此售出已收款，請先作廢相關收帳"
    );
  });
});
