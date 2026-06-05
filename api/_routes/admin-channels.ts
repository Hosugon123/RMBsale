import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, handleRouteError, methodNotAllowed, ok, readJson, requireAdmin } from "../_lib/http.js";
import { channels } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireAdmin(req);
    const db = getDb();
    if (req.method === "GET") return ok(res, { channels: await db.select().from(channels).orderBy(asc(channels.name)) });
    if (req.method === "POST") {
      const body = await readJson<{ name: string }>(req);
      const name = body.name?.trim();
      if (!name) return fail(res, 400, "請輸入渠道名稱");
      const [channel] = await db.insert(channels).values({ name }).returning();
      return ok(res, { channel }, 201);
    }
    if (req.method === "PATCH") {
      const body = await readJson<{ id: number; name?: string; isActive?: boolean }>(req);
      const [current] = await db.select().from(channels).where(eq(channels.id, body.id));
      if (!current) return fail(res, 404, "找不到渠道");

      const patch: Partial<typeof channels.$inferInsert> = {};
      const name = body.name?.trim();
      if (name) patch.name = name;
      if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
      if (Object.keys(patch).length === 0) return fail(res, 400, "沒有可更新的欄位");

      const [channel] = await db.update(channels).set(patch).where(eq(channels.id, body.id)).returning();
      return ok(res, { channel });
    }
    return methodNotAllowed(res);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "渠道操作失敗" });
  }
}
