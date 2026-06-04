import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fail, ok, requireUser } from "../_lib/http";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return fail(res, 405, "Method not allowed");
  try {
    return ok(res, { user: requireUser(req) });
  } catch {
    return ok(res, { user: null });
  }
}
