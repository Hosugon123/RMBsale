import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, readJson, requireAdmin } from "../_lib/http.js";
import { channels } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireAdmin(req);
    const db = getDb();
    if (req.method === "GET") return ok(res, { channels: await db.select().from(channels).orderBy(asc(channels.name)) });
    if (req.method === "POST") {
      const body = await readJson<{ name: string }>(req);
      const [channel] = await db.insert(channels).values({ name: body.name }).returning();
      return ok(res, { channel }, 201);
    }
    if (req.method === "PATCH") {
      const body = await readJson<{ id: number; name?: string; isActive?: boolean }>(req);
      const [channel] = await db.update(channels).set({ name: body.name, isActive: body.isActive }).where(eq(channels.id, body.id)).returning();
      return ok(res, { channel });
    }
    return fail(res, 405, "Method not allowed");
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 403, error instanceof Error ? error.message : "Channels failed");
  }
}
