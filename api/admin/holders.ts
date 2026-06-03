import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../_lib/db";
import { fail, ok, readJson, requireAdmin } from "../_lib/http";
import { holders } from "../_lib/schema";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    requireAdmin(req);
    const db = getDb();
    if (req.method === "GET") return ok(res, { holders: await db.select().from(holders).orderBy(asc(holders.name)) });
    if (req.method === "POST") {
      const body = await readJson<{ name: string }>(req);
      const [holder] = await db.insert(holders).values({ name: body.name }).returning();
      return ok(res, { holder }, 201);
    }
    if (req.method === "PATCH") {
      const body = await readJson<{ id: number; name?: string; isActive?: boolean }>(req);
      const [holder] = await db.update(holders).set({ name: body.name, isActive: body.isActive }).where(eq(holders.id, body.id)).returning();
      return ok(res, { holder });
    }
    return fail(res, 405, "Method not allowed");
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 403, error instanceof Error ? error.message : "Holders failed");
  }
}
