import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearSessionCookie, fail, ok, methodNotAllowed } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  clearSessionCookie(res);
  return ok(res, { ok: true });
}
