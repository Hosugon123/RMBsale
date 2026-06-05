import type { Purchase } from "./types";

export const DEPOSIT_CHANNEL = "入金";

export function isDepositPurchase(purchase: Pick<Purchase, "channelName">) {
  return purchase.channelName === DEPOSIT_CHANNEL;
}

export function isPurchasePayable(purchase: Pick<Purchase, "channelName" | "paymentStatus">) {
  if (isDepositPurchase(purchase)) return false;
  return purchase.paymentStatus !== "paid";
}

export function purchasePaymentStatusLabel(
  purchase: Pick<Purchase, "channelName" | "paymentStatus">
) {
  if (isDepositPurchase(purchase)) return "入金";
  if (purchase.paymentStatus === "paid") return "已付款";
  if (purchase.paymentStatus === "partial") return "部分付款";
  return "待付款";
}
