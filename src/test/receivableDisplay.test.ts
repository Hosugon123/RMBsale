import { describe, expect, it } from "vitest";
import { describeReceivable, fmtReceivableBalance, settlementReceivablePreview, sumPendingReceivable } from "../lib/receivableDisplay";

describe("receivableDisplay", () => {
  it("shows overpay when balance is negative", () => {
    expect(describeReceivable("-40000")).toMatchObject({
      statusLabel: "多付",
      statusTone: "overpaid",
      displayAmount: "40000.00"
    });
    expect(fmtReceivableBalance("-40000")).toBe("多付 NT$ 40,000.00");
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
});
