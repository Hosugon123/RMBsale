import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, eq, ne } from "drizzle-orm";
import { assertAccountDeletable } from "../_lib/accountGuards.js";
import { getDb } from "../_lib/db.js";
import { fail, ok, readJson, requireAdmin } from "../_lib/http.js";
import { accounts } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireAdmin(req);
    const db = getDb();

    if (req.method === "PATCH") {
      const body = await readJson<{ id: number; name?: string; isActive?: boolean }>(req);
      const [account] = await db.select().from(accounts).where(eq(accounts.id, body.id));
      if (!account) return fail(res, 404, "找不到帳戶");

      if (body.isActive === false) {
        await assertAccountDeletable(body.id);
      }

      const name = body.name?.trim();
      if (name) {
        const [duplicate] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.holderId, account.holderId),
              eq(accounts.currency, account.currency),
              eq(accounts.name, name),
              eq(accounts.isActive, true),
              ne(accounts.id, account.id)
            )
          );
        if (duplicate) {
          return fail(res, 400, "此持有人已有相同名稱與幣別的帳戶");
        }
      }

      const patch: Partial<typeof accounts.$inferInsert> = {};
      if (name) patch.name = name;
      if (typeof body.isActive === "boolean") patch.isActive = body.isActive;

      const [row] = await db.update(accounts).set(patch).where(eq(accounts.id, body.id)).returning();
      return ok(res, { account: row });
    }

    return fail(res, 405, "Method not allowed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Accounts failed";
    if (message === "Unauthorized") return fail(res, 401, message);
    if (message === "Admin permission is required") return fail(res, 403, message);
    return fail(res, 400, message);
  }
}
