import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { createPurchase } from "../_lib/transactions.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requirePermission } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = await requirePermission(req, "purchase");
    const purchase = await createPurchase(await readJson(req), { id: user.id, ...getClientMeta(req) });
    return ok(res, { purchase }, 201);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "買入失敗" });
  }
}
