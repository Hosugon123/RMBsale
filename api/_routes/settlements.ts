import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { createSettlement } from "../_lib/transactions.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requireWriteAccess } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = await requireWriteAccess(req);
    const settlement = await createSettlement(await readJson(req), { id: user.id, ...getClientMeta(req) });
    return ok(res, { settlement }, 201);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "收帳失敗" });
  }
}
