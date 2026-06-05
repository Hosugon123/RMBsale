import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { loadBootstrapState } from "../_lib/bootstrap.js";
import { fail, ok, requireUser, methodNotAllowed, handleRouteError } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  try {
    const user = requireUser(req);
    const lite = req.query.lite === "1" || req.query.lite === "true";
    const state = await loadBootstrapState(user.id, { skipSchemaEnsure: lite });
    return ok(res, { state, user });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 500 });
  }
}
