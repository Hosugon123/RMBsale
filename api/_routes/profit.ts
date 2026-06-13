import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { createOpeningProfit } from "../_lib/transactions.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requireWriteAccess } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = await requireWriteAccess(req);
    const result = await createOpeningProfit(await readJson(req), { id: user.id, ...getClientMeta(req) });
    return ok(res, result, 201);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "新增期初利潤失敗" });
  }
}
