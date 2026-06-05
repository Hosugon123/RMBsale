import type { purchases, sales } from "./schema.js";

type SaleRow = typeof sales.$inferSelect;
type PurchaseRow = typeof purchases.$inferSelect;

export function assertSaleEditable(sale: SaleRow) {
  if (sale.status === "reversed") {
    throw new Error("已作廢的銷貨單不可修改，請使用沖銷／調整");
  }
  if (sale.settlementStatus !== "unsettled") {
    throw new Error("已收款銷貨單不可直接修改金額，請使用沖銷／調整");
  }
}

export function assertPurchaseEditable(purchase: PurchaseRow) {
  if (purchase.status === "reversed") {
    throw new Error("已作廢的進貨單不可修改，請使用沖銷／調整");
  }
  if (purchase.paymentStatus === "paid") {
    throw new Error("已付款進貨單不可直接修改金額，請使用沖銷／調整");
  }
}

export function assertNotReversedStatus(status: string, label = "資料") {
  if (status === "reversed") {
    throw new Error(`已沖銷的${label}不可再次修改`);
  }
}
