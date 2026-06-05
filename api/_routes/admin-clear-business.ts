import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { AuditAction, writeAudit } from "../_lib/audit.js";
import { clearBusinessTables } from "../_lib/clearBusiness.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, requireAdmin } from "../_lib/http.js";
import { getDb } from "../_lib/db.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const admin = await requireAdmin(req);
    if (req.method !== "POST") return methodNotAllowed(res);
    const meta = getClientMeta(req);
    await writeAudit(getDb(), {
      action: AuditAction.CLEAR_BUSINESS,
      targetType: "business",
      actor: { id: admin.id, username: admin.username, ...meta }
    });
    await clearBusinessTables();
    return ok(res, { cleared: true });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "清除帳務失敗", validationStatus: 500 });
  }
}
