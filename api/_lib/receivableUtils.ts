import { and, count, eq } from "drizzle-orm";
import type { DbTx } from "./db.js";
import { money } from "./money.js";
import { customers, sales, settlements } from "./schema.js";

export function resolveCustomerSettlementStatus(
  receivableTwd: string | number,
  activeSaleTwdAmounts: Array<string | number>,
  hasSettlements = false
): "unsettled" | "partial" | "settled" {
  const receivable = money(receivableTwd);
  if (receivable.lte(0)) return "settled";
  if (activeSaleTwdAmounts.length === 0) return "partial";
  const totalSaleTwd = activeSaleTwdAmounts.reduce(
    (sum, amount) => sum.add(money(amount)),
    money(0)
  );
  if (receivable.lt(totalSaleTwd)) return "partial";
  if (receivable.gt(totalSaleTwd) && hasSettlements) return "partial";
  return "unsettled";
}

export async function syncCustomerSalesSettlementStatus(tx: DbTx, customerId: number) {
  const [customerAfter] = await tx
    .select({ receivableTwd: customers.receivableTwd })
    .from(customers)
    .where(eq(customers.id, customerId));
  const activeSales = await tx
    .select({ twdAmount: sales.twdAmount })
    .from(sales)
    .where(and(eq(sales.customerId, customerId), eq(sales.status, "active")));
  const [settlementCount] = await tx
    .select({ total: count() })
    .from(settlements)
    .where(and(eq(settlements.customerId, customerId), eq(settlements.status, "active")));
  const hasSettlements = Number(settlementCount?.total ?? 0) > 0;
  const settlementStatus = resolveCustomerSettlementStatus(
    customerAfter?.receivableTwd ?? 0,
    activeSales.map((sale) => sale.twdAmount),
    hasSettlements
  );
  await tx
    .update(sales)
    .set({ settlementStatus })
    .where(and(eq(sales.customerId, customerId), eq(sales.status, "active")));
}
