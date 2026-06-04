import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fail, ok, requireAdmin } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  try {
    await requireAdmin(req);
    return ok(res, { message: "Reversal endpoint scaffolded. Implement per-transaction reversal after production data validation." }, 202);
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 403, error instanceof Error ? error.message : "Reverse failed");
  }
}
