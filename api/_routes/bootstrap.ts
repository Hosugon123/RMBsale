import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadBootstrapState } from "../_lib/bootstrap";
import { fail, ok, requireUser } from "../_lib/http";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return fail(res, 405, "Method not allowed");
  try {
    const user = requireUser(req);
    const state = await loadBootstrapState(user.id);
    return ok(res, { state, user });
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 500, error instanceof Error ? error.message : "Bootstrap failed");
  }
}
