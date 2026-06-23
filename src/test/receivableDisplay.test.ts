import { describe, expect, it } from "vitest";
import { describeReceivable, fmtReceivableBalance, resolveCustomerSettlementStatus, settlementReceivablePreview, sumPendingReceivable } from "../lib/receivableDisplay";
import { parseMoneyInput } from "../lib/utils";

describe("receivableDisplay", () => {
  it("shows overpay when balance is negative", () => {
    expect(describeReceivable("-40000")).toMatchObject({
      statusLabel: "多付",
      statusTone: "overpaid",
      displayAmount: "40000.00"
    });
    expect(fmtReceivableBalance("-40000")).toBe("多付 NT$ 40,000");
  });

  it("sums only pending receivables", () => {
    expect(
      sumPendingReceivable([
        { receivableTwd: "10000.00" },
        { receivableTwd: "-5000.00" },
        { receivableTwd: "2500.00" }
      ])
    ).toBe("12500.00");
  });

  it("calculates overpay preview for settlement", () => {
    const preview = settlementReceivablePreview("10000", "50000");
    expect(preview.isOverpay).toBe(true);
    expect(preview.overpayAmount.toFixed(2)).toBe("40000.00");
    expect(preview.after.toFixed(2)).toBe("-40000.00");
  });

  it("does not treat zero payment on overpaid customer as overpay", () => {
    const preview = settlementReceivablePreview("-34199.00", "0");
    expect(preview.isOverpay).toBe(false);
    expect(preview.overpayAmount.toFixed(2)).toBe("0.00");
    expect(preview.after.toFixed(2)).toBe("-34199.00");
  });

  it("does not treat zero payment on pending receivable as overpay", () => {
    const preview = settlementReceivablePreview("15801.00", "0");
    expect(preview.isOverpay).toBe(false);
    expect(preview.after.toFixed(2)).toBe("15801.00");
  });

  it("parseMoneyInput rejects invalid form input without throwing", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("0")!.toFixed()).toBe("0");
    expect(parseMoneyInput("15800.05")?.toFixed(2)).toBe("15800.05");
    expect(parseMoneyInput(".")).toBeNull();
    expect(parseMoneyInput("-")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
  });

  it("resolves settlement status from receivable and sales", () => {
    expect(resolveCustomerSettlementStatus("-1000", ["5000"])).toBe("settled");
    expect(resolveCustomerSettlementStatus("5000", ["5000"])).toBe("unsettled");
    expect(resolveCustomerSettlementStatus("2000", ["5000"])).toBe("partial");
    expect(resolveCustomerSettlementStatus("10000", ["9000"], true)).toBe("partial");
    expect(resolveCustomerSettlementStatus("12000", ["9000"], false)).toBe("unsettled");
  });
});
