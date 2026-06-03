import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc, eq } from "drizzle-orm";
import { getDb } from "./_lib/db";
import { fail, ok, requireUser } from "./_lib/http";
import { accounts, holders } from "./_lib/schema";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return fail(res, 405, "Method not allowed");
  try {
    requireUser(req);
    const db = getDb();
    const rows = await db.select({
      id: accounts.id,
      name: accounts.name,
      currency: accounts.currency,
      balance: accounts.balance,
      profitBalance: accounts.profitBalance,
      holderId: holders.id,
      holderName: holders.name
    }).from(accounts).innerJoin(holders, eq(accounts.holderId, holders.id)).orderBy(asc(holders.name), asc(accounts.currency), asc(accounts.name));
    return ok(res, { accounts: rows });
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 500, error instanceof Error ? error.message : "Accounts failed");
  }
}
