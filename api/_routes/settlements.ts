import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSettlement } from "../_lib/transactions.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requireUser } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = requireUser(req);
    const settlement = await createSettlement(await readJson(req), { id: user.id, ...getClientMeta(req) });
    return ok(res, { settlement }, 201);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "收帳失敗" });
  }
}
