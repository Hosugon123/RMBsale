import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, requireAdmin, methodNotAllowed, handleRouteError } from "../_lib/http.js";
import { auditLogs } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  try {
    await requireAdmin(req);
    const db = getDb();
    return ok(res, { auditLogs: await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200) });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 403 });
  }
}
