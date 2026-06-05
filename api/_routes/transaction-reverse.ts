import type { VercelRequest, VercelResponse } from "@vercel/node";
import { reverseOperation } from "../_lib/reversals.js";
import { fail, getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requireUser } from "../_lib/http.js";

/** 相容舊路徑：POST body { entityType, entityId } */
export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = requireUser(req);
    const body = await readJson<{ entityType?: string; entityId?: number }>(req);
    if (!body.entityType || !body.entityId) {
      return fail(res, 400, "請提供 entityType 與 entityId");
    }
    const result = await reverseOperation(
      { entityType: body.entityType as "purchase" | "sale" | "settlement" | "transfer" | "adjustment", entityId: body.entityId },
      { id: user.id, ...getClientMeta(req) }
    );
    return ok(res, { reversed: true, result });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "作廢失敗" });
  }
}
