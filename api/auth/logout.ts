import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearSessionCookie, fail, ok } from "../_lib/http";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  clearSessionCookie(res);
  return ok(res, { ok: true });
}
