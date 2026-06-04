import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearBusinessTables } from "../_lib/clearBusiness.js";
import { fail, ok, requireAdmin } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await requireAdmin(req);
    if (req.method !== "POST") return fail(res, 405, "Method not allowed");
    await clearBusinessTables();
    return ok(res, { cleared: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Clear failed";
    if (message === "Unauthorized") return fail(res, 401, message);
    if (message === "Admin permission is required") return fail(res, 403, message);
    return fail(res, 500, message);
  }
}
