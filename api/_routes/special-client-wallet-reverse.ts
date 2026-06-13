import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { reverseSpecialClientWalletEntry } from "../_lib/specialClientWallet.js";
import {
  getClientMeta,
  ok,
  requireWriteAccess,
  methodNotAllowed,
  handleRouteError,
  readJson
} from "../_lib/http.js";

type ReverseBody = {
  entryId: number;
  reverseReason: string;
  clientId?: number;
};

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = await requireWriteAccess(req);
    const body = await readJson<ReverseBody>(req);
    const wallet = await reverseSpecialClientWalletEntry(body, { id: user.id, ...getClientMeta(req) });
    return ok(res, wallet, 201);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "沖銷失敗", validationStatus: 400 });
  }
}
