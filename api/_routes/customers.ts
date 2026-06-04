import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, readJson, requireAdmin, requireUser } from "../_lib/http.js";
import { customers } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    requireUser(req);
    const db = getDb();
    if (req.method === "POST") {
      const body = await readJson<{ name: string }>(req);
      const name = body.name.trim();
      const [existing] = await db.select().from(customers).where(eq(customers.name, name));
      if (existing) {
        if (!existing.isActive) {
          await db.update(customers).set({ isActive: true }).where(eq(customers.id, existing.id));
        }
        return ok(res, { customer: existing });
      }
      const [customer] = await db.insert(customers).values({ name }).returning();
      return ok(res, { customer }, 201);
    }
    if (req.method === "PATCH") {
      await requireAdmin(req);
      const body = await readJson<{ id: number; name?: string; isActive?: boolean }>(req);
      const [customer] = await db.select().from(customers).where(eq(customers.id, body.id));
      if (!customer) return fail(res, 404, "找不到客戶");
      const name = body.name?.trim();
      if (name) {
        const [duplicate] = await db.select().from(customers).where(eq(customers.name, name));
        if (duplicate && duplicate.id !== customer.id && duplicate.isActive) {
          return fail(res, 400, "此客戶名稱已被使用");
        }
      }
      const patch: Partial<typeof customers.$inferInsert> = {};
      if (name) patch.name = name;
      if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
      const [row] = await db.update(customers).set(patch).where(eq(customers.id, body.id)).returning();
      return ok(res, { customer: row });
    }
    if (req.method !== "GET") return fail(res, 405, "Method not allowed");
    return ok(res, { customers: await db.select().from(customers).orderBy(asc(customers.name)) });
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 500, error instanceof Error ? error.message : "Customers failed");
  }
}
