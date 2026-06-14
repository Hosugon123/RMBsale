import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, requireUser, methodNotAllowed, handleRouteError } from "../_lib/http.js";
import { accounts, customers, ledgerEntries, rmbLots, sales } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  try {
    requireUser(req);
    const db = getDb();
    const [twd] = await db.select({ value: sql<string>`coalesce(sum(${accounts.balance}), 0)` }).from(accounts).where(eq(accounts.currency, "TWD"));
    const [rmb] = await db.select({ value: sql<string>`coalesce(sum(${accounts.balance}), 0)` }).from(accounts).where(eq(accounts.currency, "RMB"));
    const [receivable] = await db.select({ value: sql<string>`coalesce(sum(case when ${customers.receivableTwd} > 0 then ${customers.receivableTwd} else 0 end), 0)` }).from(customers);
    const [inventory] = await db.select({ value: sql<string>`coalesce(sum(${rmbLots.remainingRmb}), 0)` }).from(rmbLots);
    const [saleProfit] = await db.select({ value: sql<string>`coalesce(sum(${sales.profitTwd}), 0)` }).from(sales).where(eq(sales.status, "active"));
    const [openingProfit] = await db
      .select({ value: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
      .from(ledgerEntries)
      .where(sql`${ledgerEntries.relatedTable} = 'opening_profit' and ${ledgerEntries.direction} = 'in' and ${ledgerEntries.currency} = 'TWD' and ${ledgerEntries.isReversal} = false`);
    const recentLedger = await db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt)).limit(10);
    return ok(res, { totals: { twd: twd.value, rmb: rmb.value, receivable: receivable.value, inventory: inventory.value, profit: String(Number(saleProfit.value) + Number(openingProfit.value)) }, recentLedger });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 500 });
  }
}
