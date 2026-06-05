import type { VercelRequest, VercelResponse } from "@vercel/node";
import { payPurchasePayment } from "../_lib/transactions.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requireUser } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = requireUser(req);
    const purchase = await payPurchasePayment(await readJson(req), { id: user.id, ...getClientMeta(req) });
    return ok(res, { purchase }, 201);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "買入付款失敗" });
  }
}
