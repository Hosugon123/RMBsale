import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearBusinessTables } from "../_lib/clearBusiness.js";
import { handleRouteError, methodNotAllowed, ok, requireAdmin } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireAdmin(req);
    if (req.method !== "POST") return methodNotAllowed(res);
    await clearBusinessTables();
    return ok(res, { cleared: true });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "清除帳務失敗", validationStatus: 500 });
  }
}
