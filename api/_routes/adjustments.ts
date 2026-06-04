import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createAccountAdjustment } from "../_lib/transactions.js";
import { fail, getClientMeta, ok, readJson, requireUser } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  try {
    const user = requireUser(req);
    const result = await createAccountAdjustment(await readJson(req), { id: user.id, ...getClientMeta(req) });
    return ok(res, { result }, 201);
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 400, error instanceof Error ? error.message : "Adjustment failed");
  }
}
