import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { getDb } from "../_lib/db.js";
import { handleRouteError, methodNotAllowed, ok, requireAdmin } from "../_lib/http.js";
import { runProfitAudit } from "../_lib/profitAudit.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireAdmin(req);
    if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res);

    const db = getDb();
    const report = await db.transaction((tx) => runProfitAudit(tx));
    return ok(res, { report });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "利潤稽核失敗", validationStatus: 500 });
  }
}
