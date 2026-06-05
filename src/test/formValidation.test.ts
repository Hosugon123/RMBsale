import { describe, expect, it } from "vitest";
import { validatePurchaseForm, validateSaleForm } from "../lib/formValidation";

describe("form validation guards", () => {
  it("blocks empty sale submissions", () => {
    expect(
      validateSaleForm({
        customerName: "",
        rmbAccountId: "4",
        rmbAmount: "100",
        exchangeRate: "4.5",
        profitError: null
      })
    ).toBe("請選擇常用客戶或填寫其他客戶");

    expect(
      validateSaleForm({
        customerName: "阿明",
        rmbAccountId: "",
        rmbAmount: "100",
        exchangeRate: "4.5",
        profitError: null
      })
    ).toBe("請選擇扣款 RMB 帳戶");

    expect(
      validateSaleForm({
        customerName: "阿明",
        rmbAccountId: "4",
        rmbAmount: "0",
        exchangeRate: "4.5",
        profitError: null
      })
    ).toBe("RMB 金額須大於 0");

    expect(
      validateSaleForm({
        customerName: "阿明",
        rmbAccountId: "4",
        rmbAmount: "100",
        exchangeRate: "4.5",
        profitError: "無法計算利潤"
      })
    ).toBe("無法計算利潤");

    expect(
      validateSaleForm({
        customerName: "阿明",
        rmbAccountId: "4",
        rmbAmount: "100",
        exchangeRate: "4.5",
        profitError: null,
        profitWarning: "庫存不足，將以帳戶負餘額記帳"
      })
    ).toBeNull();
  });

  it("blocks empty purchase submissions", () => {
    expect(
      validatePurchaseForm({
        channelName: "",
        paymentStatus: "paid",
        paymentAccountId: "1",
        depositAccountId: "4",
        rmbAmount: "100",
        exchangeRate: "4.5"
      })
    ).toBe("請選擇常用渠道或填寫其他渠道");

    expect(
      validatePurchaseForm({
        channelName: "交易所 A",
        paymentStatus: "",
        paymentAccountId: "",
        depositAccountId: "4",
        rmbAmount: "100",
        exchangeRate: "4.5"
      })
    ).toBe("請選擇付款狀態");

    expect(
      validatePurchaseForm({
        channelName: "交易所 A",
        paymentStatus: "paid",
        paymentAccountId: "",
        depositAccountId: "4",
        rmbAmount: "100",
        exchangeRate: "4.5"
      })
    ).toBe("已付款時請選擇付款台幣帳戶");
  });
});
