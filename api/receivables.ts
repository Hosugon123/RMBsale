import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc, gt } from "drizzle-orm";
import { getDb } from "./_lib/db";
import { fail, ok, requireUser } from "./_lib/http";
import { customers } from "./_lib/schema";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return fail(res, 405, "Method not allowed");
  try {
    requireUser(req);
    const db = getDb();
    return ok(res, { receivables: await db.select().from(customers).where(gt(customers.receivableTwd, "0")).orderBy(desc(customers.receivableTwd)) });
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 500, error instanceof Error ? error.message : "Receivables failed");
  }
}
