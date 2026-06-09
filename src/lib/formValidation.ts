import { d } from "./utils";

export type PaymentStatusChoice = "" | "paid" | "unpaid";

export function validateSaleForm(input: {
  customerName: string;
  rmbAccountId: string;
  rmbAmount: string;
  exchangeRate: string;
  profitError: string | null;
  profitWarning?: string | null;
}) {
  if (!input.customerName) return "請選擇常用客戶或填寫其他客戶";
  if (!input.rmbAccountId) return "請選擇扣款 RMB 帳戶";
  if (!input.rmbAmount.trim()) return "請輸入 RMB 金額";
  if (!d(input.rmbAmount).gt(0)) return "RMB 金額須大於 0";
  if (!input.exchangeRate.trim()) return "請輸入售出匯率";
  if (!d(input.exchangeRate).gt(0)) return "售出匯率須大於 0";
  if (input.profitError) return input.profitError;
  return null;
}

export function validatePurchaseForm(input: {
  channelName: string;
  paymentStatus: PaymentStatusChoice;
  paymentAccountId: string;
  depositAccountId: string;
  rmbAmount: string;
  exchangeRate: string;
}) {
  if (!input.channelName) return "請選擇常用渠道或填寫其他渠道";
  if (!input.depositAccountId) return "請選擇入帳 RMB 帳戶";
  if (!input.paymentStatus) return "請選擇付款狀態";
  if (input.paymentStatus === "paid" && !input.paymentAccountId) return "已付款時請選擇付款台幣帳戶";
  if (!input.rmbAmount.trim()) return "請輸入 RMB 金額";
  if (!d(input.rmbAmount).gt(0)) return "RMB 金額須大於 0";
  if (!input.exchangeRate.trim()) return "請輸入買入匯率";
  if (!d(input.exchangeRate).gt(0)) return "買入匯率須大於 0";
  return null;
}
