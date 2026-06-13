import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { createSpecialClientPayout, getSpecialClientWallet } from "../_lib/specialClientWallet.js";
import {
  getClientMeta,
  ok,
  requireWriteAccess,
  methodNotAllowed,
  handleRouteError,
  readJson
} from "../_lib/http.js";

type PayoutBody = {
  clientId: number;
  entryDate: string;
  payoutRmb: string;
  vendorName: string;
  cashAccountId: number;
  purpose?: string;
  note?: string;
};

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = await requireWriteAccess(req);
    const body = await readJson<PayoutBody>(req);
    await createSpecialClientPayout(body, { id: user.id, ...getClientMeta(req) });
    const wallet = await getSpecialClientWallet({ clientId: body.clientId });
    return ok(res, wallet, 201);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "代付失敗", validationStatus: 400 });
  }
}
