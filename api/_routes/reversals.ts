import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { reverseOperation, type ReversalEntityType } from "../_lib/reversals.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requirePermission } from "../_lib/http.js";
import type { PermissionKey } from "../_lib/userPermissions.js";

type ReversalBody = {
  entityType: ReversalEntityType;
  entityId: number;
};

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const body = await readJson<ReversalBody>(req);
    if (!body.entityType || !body.entityId) {
      throw new Error("請提供 entityType 與 entityId");
    }
    const permissionByType: Record<ReversalEntityType, PermissionKey> = {
      purchase: "purchase", sale: "sale", settlement: "receivables",
      transfer: "transfer", adjustment: "accounts", interest: "receivables"
    };
    const user = await requirePermission(req, permissionByType[body.entityType]);
    const result = await reverseOperation(body, { id: user.id, ...getClientMeta(req) });
    return ok(res, { reversed: true, result });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "作廢失敗" });
  }
}
