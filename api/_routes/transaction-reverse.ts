import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { handler as reversalHandler } from "./reversals.js";

/** 相容舊路徑：POST body { entityType, entityId } */
export async function handler(req: VercelRequest, res: VercelResponse) {
  return reversalHandler(req, res);
}
