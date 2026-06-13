import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { createSpecialClientDeposit, getSpecialClientWallet } from "../_lib/specialClientWallet.js";
import {
  getClientMeta,
  ok,
  requireWriteAccess,
  methodNotAllowed,
  handleRouteError,
  readJson
} from "../_lib/http.js";

type DepositBody = {
  clientId: number;
  entryDate: string;
  usdAmount?: string | null;
  usdToRmbRate?: string | null;
  grossRmb: string;
  feeRate?: string;
  cashAccountId: number;
  note?: string;
};

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  try {
    const user = await requireWriteAccess(req);
    const body = await readJson<DepositBody>(req);
    await createSpecialClientDeposit(body, { id: user.id, ...getClientMeta(req) });
    const wallet = await getSpecialClientWallet({ clientId: body.clientId });
    return ok(res, wallet, 201);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "儲值失敗", validationStatus: 400 });
  }
}
