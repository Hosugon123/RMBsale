import type { VercelRequest, VercelResponse } from "@vercel/node";
import { reverseOperation, type ReversalEntityType } from "../_lib/reversals.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requireUser } from "../_lib/http.js";

type ReversalBody = {
  entityType: ReversalEntityType;
  entityId: number;
};

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = requireUser(req);
    const body = await readJson<ReversalBody>(req);
    if (!body.entityType || !body.entityId) {
      throw new Error("請提供 entityType 與 entityId");
    }
    const result = await reverseOperation(body, { id: user.id, ...getClientMeta(req) });
    return ok(res, { reversed: true, result });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "作廢失敗" });
  }
}
