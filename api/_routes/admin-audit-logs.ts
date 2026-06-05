import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { desc } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { formatAuditLog } from "../_lib/audit.js";
import { ok, requireAdmin, methodNotAllowed, handleRouteError } from "../_lib/http.js";
import { auditLogs } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  try {
    await requireAdmin(req);
    const db = getDb();
    const limit = Math.min(Number(req.query.limit ?? 200), 1000);
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
    return ok(res, { auditLogs: rows.map(formatAuditLog) });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 403 });
  }
}
