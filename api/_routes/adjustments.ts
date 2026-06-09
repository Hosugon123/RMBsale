import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { createAccountAdjustment } from "../_lib/transactions.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requireWriteAccess } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = await requireWriteAccess(req);
    const result = await createAccountAdjustment(await readJson(req), { id: user.id, ...getClientMeta(req) });
    return ok(res, { result }, 201);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "入出金失敗" });
  }
}
