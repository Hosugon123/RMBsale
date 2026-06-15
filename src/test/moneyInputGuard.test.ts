import { describe, expect, it } from "vitest";
import { validatePurchaseForm, validateSaleForm } from "../lib/formValidation";
import {
  addSettlement,
  createOpeningProfit,
  createOpeningReceivable,
  createSeedState,
  previewSaleProfit
} from "../lib/localStore";

describe("money input guards", () => {
  it("rejects incomplete sale and purchase amounts without throwing Decimal errors", () => {
    expect(() =>
      validateSaleForm({
        customerName: "測試客戶",
        rmbAccountId: "1",
        rmbAmount: ".",
        exchangeRate: "4.5",
        profitError: null
      })
    ).not.toThrow();
    expect(
      validateSaleForm({
        customerName: "測試客戶",
        rmbAccountId: "1",
        rmbAmount: ".",
        exchangeRate: "4.5",
        profitError: null
      })
    ).toBe("RMB 金額須大於 0");

    expect(() =>
      validatePurchaseForm({
        channelName: "測試渠道",
        paymentStatus: "unpaid",
        paymentAccountId: "",
        depositAccountId: "1",
        rmbAmount: "100",
        exchangeRate: "."
      })
    ).not.toThrow();
    expect(
      validatePurchaseForm({
        channelName: "測試渠道",
        paymentStatus: "unpaid",
        paymentAccountId: "",
        depositAccountId: "1",
        rmbAmount: "100",
        exchangeRate: "."
      })
    ).toBe("買入匯率須大於 0");
  });

  it("keeps sale previews safe while the user is still typing", () => {
    const state = createSeedState();
    expect(() =>
      previewSaleProfit(state, {
        rmbAccountId: 4,
        rmbAmount: ".",
        exchangeRate: "4.5"
      })
    ).not.toThrow();
    expect(previewSaleProfit(state, { rmbAccountId: 4, rmbAmount: ".", exchangeRate: "4.5" })).toBeNull();
  });

  it("raises friendly validation errors for invalid accounting amounts", () => {
    const state = createSeedState();

    expect(() => addSettlement(state, { customerId: 1, accountId: 1, amountTwd: "." })).toThrow("金額必須大於 0");
    expect(() => createOpeningReceivable(state, { customerName: "測試客戶", amountTwd: "." })).toThrow(
      "待收金額必須大於 0"
    );
    expect(() => createOpeningProfit(state, { amountTwd: "." })).toThrow("利潤金額必須大於 0");
  });
});
