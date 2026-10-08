import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { createInterestReceivable } from "../_lib/transactions.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requirePermission } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requirePermission(req, "receivables");
    if (req.method !== "POST") return methodNotAllowed(res);
    const result = await createInterestReceivable(await readJson(req), { id: user.id, ...getClientMeta(req) });
    return ok(res, result);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "新增利息失敗" });
  }
}
