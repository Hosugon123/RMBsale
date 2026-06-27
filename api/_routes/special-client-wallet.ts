import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import {
  createSpecialClient,
  getSpecialClientWallet,
  type WalletEntryTypeFilter,
  type WalletQueryParams
} from "../_lib/specialClientWallet.js";
import {
  getClientMeta,
  handleRouteError,
  methodNotAllowed,
  ok,
  readJson,
  requireUser,
  requireWriteAccess
} from "../_lib/http.js";

function parseQuery(req: VercelRequest): WalletQueryParams {
  const q = req.query ?? {};
  const read = (key: string) => {
    const raw = q[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (Array.isArray(raw) && raw[0]) return String(raw[0]).trim();
    return undefined;
  };

  const clientIdRaw = read("clientId");
  const clientId = clientIdRaw ? Number(clientIdRaw) : undefined;
  if (clientId !== undefined && !Number.isFinite(clientId)) throw new Error("clientId 格式不正確");

  const entryType = read("entryType") as WalletEntryTypeFilter | undefined;
  if (entryType && !["all", "deposit", "payout", "reversal"].includes(entryType)) {
    throw new Error("entryType 格式不正確");
  }

  return {
    clientId,
    dateFrom: read("dateFrom"),
    dateTo: read("dateTo"),
    entryType: entryType ?? "all"
  };
}

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      requireUser(req);
      const data = await getSpecialClientWallet(parseQuery(req));
      return ok(res, data);
    }

    if (req.method === "POST") {
      const user = await requireWriteAccess(req);
      const body = await readJson<{ name?: string; feeRate?: string | null }>(req);
      const data = await createSpecialClient(
        { name: body.name ?? "", feeRate: body.feeRate ?? undefined },
        { id: user.id, ...getClientMeta(req) }
      );
      return ok(res, data, 201);
    }

    return methodNotAllowed(res);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "讀取儲值客戶資料失敗", validationStatus: 400 });
  }
}
