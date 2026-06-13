import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { asc, eq } from "drizzle-orm";
import { AuditAction, writeAudit } from "../_lib/audit.js";
import { insertCustomerDeleteLedger } from "../_lib/adminLedger.js";
import { getDb } from "../_lib/db.js";
import { fail, getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requireAdmin, requireUser } from "../_lib/http.js";
import { customers } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    requireUser(req);
    const db = getDb();
    if (req.method === "POST") {
      const body = await readJson<{ name: string }>(req);
      const name = body.name?.trim();
      if (!name) return fail(res, 400, "請輸入客戶名稱");

      const { customer, created } = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(customers).where(eq(customers.name, name));
        if (existing) {
          if (!existing.isActive) {
            const [reactivated] = await tx
              .update(customers)
              .set({ isActive: true })
              .where(eq(customers.id, existing.id))
              .returning();
            return { customer: reactivated, created: false };
          }
          return { customer: existing, created: false };
        }
        const [inserted] = await tx.insert(customers).values({ name }).returning();
        return { customer: inserted, created: true };
      });

      return ok(res, { customer }, created ? 201 : 200);
    }
    if (req.method === "PATCH") {
      const admin = await requireAdmin(req);
      const meta = getClientMeta(req);
      const body = await readJson<{ id: number; name?: string; isActive?: boolean; deleteReason?: string }>(req);
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
      const row = await db.transaction(async (tx) => {
        const [updated] = await tx.update(customers).set(patch).where(eq(customers.id, body.id)).returning();
        if (body.isActive === false) {
          await insertCustomerDeleteLedger(tx, customer, admin.id);
        }
        await writeAudit(tx, {
          action: AuditAction.CUSTOMER_UPDATE,
          targetType: "customer",
          targetId: updated.id,
          before: customer,
          after: updated,
          actor: { id: admin.id, username: admin.username, ...meta }
        });
        return updated;
      });
      return ok(res, { customer: row });
    }
    if (req.method !== "GET") return methodNotAllowed(res);
    return ok(res, { customers: await db.select().from(customers).orderBy(asc(customers.name)) });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "客戶操作失敗", validationStatus: 500 });
  }
}
