import { describe, expect, it } from "vitest";
import {
  addSale,
  addSettlement,
  createOpeningReceivable,
  createSeedState,
  sortedReceivableLedgerWithBalances,
  totals
} from "../lib/localStore";
import {
  describeReceivable,
  fmtReceivableBalance,
  settlementReceivablePreview,
  sumPendingReceivable
} from "../lib/receivableDisplay";
import { d } from "../lib/utils";

describe("settlement overpay flow", () => {
  it("runs sale → settlement overpay → display → totals → ledger without breaking accounting", () => {
    const state = createSeedState();
    const twdAccount = state.accounts.find((account) => account.id === 1)!;
    const customer = state.customers.find((item) => item.name === "阿明")!;
    const receivableBefore = customer.receivableTwd;
    const twdBefore = twdAccount.balance;
    const pendingBefore = sumPendingReceivable(state.customers);

    expect(receivableBefore).toBe("15800.05");
    expect(customer.receivableTwd).toBe(state.sales[0].twdAmount);
    expect(state.sales[0].settlementStatus).toBe("unsettled");

    const preview = settlementReceivablePreview(receivableBefore, "50000");
    expect(preview.isOverpay).toBe(true);
    expect(preview.overpayAmount.toFixed(2)).toBe("34199.95");
    expect(preview.after.toFixed(2)).toBe("-34199.95");

    addSettlement(state, {
      customerId: customer.id,
      accountId: twdAccount.id,
      amountTwd: "50000",
      note: "客戶先多付"
    });

    expect(customer.receivableTwd).toBe("-34199.95");
    expect(describeReceivable(customer.receivableTwd)).toMatchObject({
      statusLabel: "多付",
      statusTone: "overpaid",
      displayAmount: "34199.95"
    });
    expect(fmtReceivableBalance(customer.receivableTwd)).toBe("多付 NT$ 34,199.95");
    expect(state.sales.every((sale) => sale.customerId !== customer.id || sale.settlementStatus === "settled")).toBe(
      true
    );

    expect(twdAccount.balance).toBe(d(twdBefore).add("50000").toFixed(2));
    expect(sumPendingReceivable(state.customers)).toBe(
      d(pendingBefore).sub(receivableBefore).toFixed(2)
    );
    expect(totals(state).receivable).toBe(sumPendingReceivable(state.customers));

    const settlementEntry = state.ledger.find((entry) => entry.entryType === "收帳");
    expect(settlementEntry?.description).toContain("多付");
    expect(settlementEntry?.description).toContain("34199.95");
    expect(settlementEntry?.amount).toBe("50000.00");

    const settlementRow = sortedReceivableLedgerWithBalances(state).find(
      (entry) => entry.customerId === customer.id && entry.entryType === "收帳"
    );
    expect(settlementRow?.balanceBefore).toBe("15800.05");
    expect(settlementRow?.balanceAfter).toBe("-34199.95");
  });

  it("allows further settlement when customer already overpaid", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => item.name === "阿明")!;

    addSettlement(state, { customerId: customer.id, accountId: 1, amountTwd: "50000" });
    expect(customer.receivableTwd).toBe("-34199.95");

    addSettlement(state, { customerId: customer.id, accountId: 1, amountTwd: "1000" });
    expect(customer.receivableTwd).toBe("-35199.95");
    expect(fmtReceivableBalance(customer.receivableTwd)).toBe("多付 NT$ 35,199.95");
  });

  it("settles exactly without overpay when payment matches receivable", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => item.name === "阿明")!;

    addSettlement(state, { customerId: customer.id, accountId: 1, amountTwd: "15800.05" });
    expect(customer.receivableTwd).toBe("0.00");
    expect(describeReceivable(customer.receivableTwd).statusLabel).toBe("已結清");
    expect(state.sales[0].settlementStatus).toBe("settled");
  });

  it("supports overpay from opening receivable only customer", () => {
    const state = createSeedState();
    createOpeningReceivable(state, { customerName: "超付測試", amountTwd: "10000", note: "期初" });
    const customer = state.customers.find((item) => item.name === "超付測試")!;

    addSettlement(state, { customerId: customer.id, accountId: 1, amountTwd: "50000" });
    expect(customer.receivableTwd).toBe("-40000.00");
    expect(fmtReceivableBalance(customer.receivableTwd)).toBe("多付 NT$ 40,000.00");
    expect(totals(state).receivable).toBe(sumPendingReceivable(state.customers));
  });
});
