import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { AuditAction, writeAudit } from "../_lib/audit.js";
import { clearSessionCookie, getClientMeta, handleRouteError, methodNotAllowed, ok, requireUser } from "../_lib/http.js";
import { getDb } from "../_lib/db.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = requireUser(req);
    const meta = getClientMeta(req);
    await writeAudit(getDb(), {
      action: AuditAction.LOGOUT,
      targetType: "user",
      targetId: user.id,
      actor: { id: user.id, username: user.username, ...meta }
    });
    clearSessionCookie(res);
    return ok(res, { ok: true });
  } catch (error) {
    clearSessionCookie(res);
    return handleRouteError(res, error, { fallback: "登出失敗", validationStatus: 401 });
  }
}
