import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, readJson, loadAuthUser, requirePermission, methodNotAllowed, handleRouteError } from "../_lib/http.js";
import { createAccountRecord } from "../_lib/transactions.js";
import { accounts, holders } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const db = getDb();
    if (req.method === "POST") {
      await requirePermission(req, "accounts");
      const body = await readJson<{ holderId: number; name: string; currency: "TWD" | "RMB" }>(req);
      const account = await createAccountRecord(body);
      return ok(res, { account }, 201);
    }
    if (req.method !== "GET") return methodNotAllowed(res);
    await loadAuthUser(req);
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
    return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 500 });
  }
}
