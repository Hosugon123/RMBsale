import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, requireUser, methodNotAllowed, handleRouteError } from "../_lib/http.js";
import { ledgerEntries } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  try {
    requireUser(req);
    const db = getDb();
    return ok(res, { ledger: await db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt)).limit(200) });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 500 });
  }
}
