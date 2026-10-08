import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { createTransfer } from "../_lib/transactions.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requirePermission } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = await requirePermission(req, "transfer");
    const transfer = await createTransfer(await readJson(req), { id: user.id, ...getClientMeta(req) });
    return ok(res, { transfer }, 201);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "轉帳失敗" });
  }
}
