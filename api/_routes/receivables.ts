import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc, gt } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, requireUser, methodNotAllowed, handleRouteError } from "../_lib/http.js";
import { customers } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  try {
    requireUser(req);
    const db = getDb();
    return ok(res, { receivables: await db.select().from(customers).where(gt(customers.receivableTwd, "0")).orderBy(desc(customers.receivableTwd)) });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 500 });
  }
}
