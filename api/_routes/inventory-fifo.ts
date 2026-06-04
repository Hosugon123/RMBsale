import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc, gt } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, requireUser } from "../_lib/http.js";
import { rmbLots } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return fail(res, 405, "Method not allowed");
  try {
    requireUser(req);
    const db = getDb();
    return ok(res, { lots: await db.select().from(rmbLots).where(gt(rmbLots.remainingRmb, "0")).orderBy(asc(rmbLots.createdAt), asc(rmbLots.id)) });
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 500, error instanceof Error ? error.message : "Inventory failed");
  }
}
