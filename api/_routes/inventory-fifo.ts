import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc, gt } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, requireUser, methodNotAllowed, handleRouteError } from "../_lib/http.js";
import { rmbLots } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  try {
    requireUser(req);
    const db = getDb();
    return ok(res, { lots: await db.select().from(rmbLots).where(gt(rmbLots.remainingRmb, "0")).orderBy(asc(rmbLots.createdAt), asc(rmbLots.id)) });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 500 });
  }
}
