import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, requireUser } from "../_lib/http.js";
import { accounts, customers, ledgerEntries, rmbLots, sales } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return fail(res, 405, "Method not allowed");
  try {
    requireUser(req);
    const db = getDb();
    const [twd] = await db.select({ value: sql<string>`coalesce(sum(${accounts.balance}), 0)` }).from(accounts).where(eq(accounts.currency, "TWD"));
    const [rmb] = await db.select({ value: sql<string>`coalesce(sum(${accounts.balance}), 0)` }).from(accounts).where(eq(accounts.currency, "RMB"));
    const [receivable] = await db.select({ value: sql<string>`coalesce(sum(${customers.receivableTwd}), 0)` }).from(customers);
    const [inventory] = await db.select({ value: sql<string>`coalesce(sum(${rmbLots.remainingRmb}), 0)` }).from(rmbLots);
    const [profit] = await db.select({ value: sql<string>`coalesce(sum(${sales.profitTwd}), 0)` }).from(sales).where(eq(sales.status, "active"));
    const recentLedger = await db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt)).limit(10);
    return ok(res, { totals: { twd: twd.value, rmb: rmb.value, receivable: receivable.value, inventory: inventory.value, profit: profit.value }, recentLedger });
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 500, error instanceof Error ? error.message : "Dashboard failed");
  }
}
