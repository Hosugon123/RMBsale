import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc } from "drizzle-orm";
import { getDb } from "../_lib/db";
import { fail, ok, requireAdmin } from "../_lib/http";
import { auditLogs } from "../_lib/schema";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return fail(res, 405, "Method not allowed");
  try {
    requireAdmin(req);
    const db = getDb();
    return ok(res, { auditLogs: await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200) });
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 403, error instanceof Error ? error.message : "Audit logs failed");
  }
}
