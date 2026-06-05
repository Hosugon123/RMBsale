import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { and, eq, ne } from "drizzle-orm";
import { assertAccountDeletable } from "../_lib/accountGuards.js";
import { AuditAction, writeAudit } from "../_lib/audit.js";
import { getDb } from "../_lib/db.js";
import { fail, getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requireAdmin } from "../_lib/http.js";
import { accounts } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const admin = await requireAdmin(req);
    const db = getDb();

    if (req.method === "PATCH") {
      const meta = getClientMeta(req);
      const body = await readJson<{ id: number; name?: string; isActive?: boolean; deleteReason?: string }>(req);
      const account = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(accounts).where(eq(accounts.id, body.id));
        if (!current) throw new Error("找不到帳戶");

        if (body.isActive === false) {
          await assertAccountDeletable(body.id, tx);
        }

        const name = body.name?.trim();
        if (name) {
          const [duplicate] = await tx
            .select({ id: accounts.id })
            .from(accounts)
            .where(
              and(
                eq(accounts.holderId, current.holderId),
                eq(accounts.currency, current.currency),
                eq(accounts.name, name),
                eq(accounts.isActive, true),
                ne(accounts.id, current.id)
              )
            );
          if (duplicate) {
            throw new Error("此持有人已有相同名稱與幣別的帳戶");
          }
        }

        const patch: Partial<typeof accounts.$inferInsert> = {};
        if (name) patch.name = name;
        if (typeof body.isActive === "boolean") {
          patch.isActive = body.isActive;
          if (body.isActive === false) {
            patch.deletedAt = new Date();
            patch.deletedBy = admin.id;
            patch.deleteReason = body.deleteReason ?? "管理員停用";
          } else {
            patch.deletedAt = null;
            patch.deletedBy = null;
            patch.deleteReason = null;
          }
        }

        const [row] = await tx.update(accounts).set(patch).where(eq(accounts.id, body.id)).returning();
        await writeAudit(tx, {
          action: AuditAction.ACCOUNT_UPDATE,
          targetType: "account",
          targetId: row.id,
          before: current,
          after: row,
          actor: { id: admin.id, username: admin.username, ...meta }
        });
        return row;
      });
      return ok(res, { account });
    }

    return methodNotAllowed(res);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "帳戶操作失敗" });
  }
}
