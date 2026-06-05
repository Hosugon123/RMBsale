import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { and, asc, eq } from "drizzle-orm";
import { assertAccountDeletable } from "../_lib/accountGuards.js";
import { AuditAction, writeAudit } from "../_lib/audit.js";
import { getDb } from "../_lib/db.js";
import { fail, getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requireAdmin } from "../_lib/http.js";
import { accounts, holders } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const admin = await requireAdmin(req);
    const db = getDb();
    if (req.method === "GET") return ok(res, { holders: await db.select().from(holders).orderBy(asc(holders.name)) });
    if (req.method === "POST") {
      const body = await readJson<{ name: string }>(req);
      const name = body.name?.trim();
      if (!name) return fail(res, 400, "請輸入持有人名稱");
      const [holder] = await db.insert(holders).values({ name }).returning();
      return ok(res, { holder }, 201);
    }
    if (req.method === "PATCH") {
      const meta = getClientMeta(req);
      const body = await readJson<{ id: number; name?: string; isActive?: boolean; deleteReason?: string }>(req);
      const holder = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(holders).where(eq(holders.id, body.id));
        if (!current) throw new Error("找不到持有者");

        if (body.isActive === false) {
          const activeAccounts = await tx
            .select()
            .from(accounts)
            .where(and(eq(accounts.holderId, body.id), eq(accounts.isActive, true)));
          for (const account of activeAccounts) {
            await assertAccountDeletable(account.id, tx);
          }
          const now = new Date();
          for (const account of activeAccounts) {
            await tx
              .update(accounts)
              .set({
                isActive: false,
                deletedAt: now,
                deletedBy: admin.id,
                deleteReason: body.deleteReason ?? "停用持有人連動停用帳戶"
              })
              .where(eq(accounts.id, account.id));
          }
        }

        const name = body.name?.trim();
        if (name) {
          const [duplicate] = await tx.select().from(holders).where(eq(holders.name, name));
          if (duplicate && duplicate.id !== current.id && duplicate.isActive) {
            throw new Error("此持有人已存在");
          }
        }

        const patch: Partial<typeof holders.$inferInsert> = {};
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
        const [row] = await tx.update(holders).set(patch).where(eq(holders.id, body.id)).returning();
        await writeAudit(tx, {
          action: AuditAction.HOLDER_UPDATE,
          targetType: "holder",
          targetId: row.id,
          before: current,
          after: row,
          actor: { id: admin.id, username: admin.username, ...meta }
        });
        return row;
      });
      return ok(res, { holder });
    }
    return methodNotAllowed(res);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "持有人操作失敗" });
  }
}
