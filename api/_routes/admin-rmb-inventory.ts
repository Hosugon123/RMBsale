import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { AuditAction, writeAudit } from "../_lib/audit.js";
import { getDb } from "../_lib/db.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, requireAdmin } from "../_lib/http.js";
import { reconcileRmbLotInventory } from "../_lib/rmbInventory.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const admin = await requireAdmin(req);
    if (req.method !== "POST") return methodNotAllowed(res);

    const meta = getClientMeta(req);
    const actor = { id: admin.id, username: admin.username, ...meta };
    const db = getDb();
    const report = await db.transaction(async (tx) => reconcileRmbLotInventory(tx, admin.id));

    await writeAudit(db, {
      action: AuditAction.RECONCILE_RMB_INVENTORY,
      targetType: "rmb_inventory",
      after: { report },
      actor
    });

    return ok(res, { report });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "人民幣庫存修復失敗", validationStatus: 500 });
  }
}
