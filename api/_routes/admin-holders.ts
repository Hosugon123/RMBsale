import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, asc, eq } from "drizzle-orm";
import { assertAccountDeletable } from "../_lib/accountGuards.js";
import { getDb } from "../_lib/db.js";
import { fail, ok, readJson, requireAdmin } from "../_lib/http.js";
import { accounts, holders } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireAdmin(req);
    const db = getDb();
    if (req.method === "GET") return ok(res, { holders: await db.select().from(holders).orderBy(asc(holders.name)) });
    if (req.method === "POST") {
      const body = await readJson<{ name: string }>(req);
      const [holder] = await db.insert(holders).values({ name: body.name }).returning();
      return ok(res, { holder }, 201);
    }
    if (req.method === "PATCH") {
      const body = await readJson<{ id: number; name?: string; isActive?: boolean }>(req);
      const [holder] = await db.select().from(holders).where(eq(holders.id, body.id));
      if (!holder) return fail(res, 404, "找不到持有者");

      if (body.isActive === false) {
        const activeAccounts = await db
          .select()
          .from(accounts)
          .where(and(eq(accounts.holderId, body.id), eq(accounts.isActive, true)));
        for (const account of activeAccounts) {
          await assertAccountDeletable(account.id);
        }
        for (const account of activeAccounts) {
          await db.update(accounts).set({ isActive: false }).where(eq(accounts.id, account.id));
        }
      }

      const name = body.name?.trim();
      if (name) {
        const [duplicate] = await db.select().from(holders).where(eq(holders.name, name));
        if (duplicate && duplicate.id !== holder.id && duplicate.isActive) {
          return fail(res, 400, "此持有人已存在");
        }
      }

      const patch: Partial<typeof holders.$inferInsert> = {};
      if (name) patch.name = name;
      if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
      const [row] = await db.update(holders).set(patch).where(eq(holders.id, body.id)).returning();
      return ok(res, { holder: row });
    }
    return fail(res, 405, "Method not allowed");
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 403, error instanceof Error ? error.message : "Holders failed");
  }
}
