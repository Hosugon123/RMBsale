import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadBootstrapState } from "../_lib/bootstrap.js";
import { fail, ok, requireUser, methodNotAllowed, handleRouteError } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  try {
    const user = requireUser(req);
    const state = await loadBootstrapState(user.id);
    return ok(res, { state, user });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 500 });
  }
}
