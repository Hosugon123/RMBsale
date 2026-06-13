import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import {
  getSpecialClientWallet,
  type WalletEntryTypeFilter,
  type WalletQueryParams
} from "../_lib/specialClientWallet.js";
import { ok, requireUser, methodNotAllowed, handleRouteError } from "../_lib/http.js";

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
  if (req.method !== "GET") return methodNotAllowed(res);
  try {
    requireUser(req);
    const data = await getSpecialClientWallet(parseQuery(req));
    return ok(res, data);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "讀取失敗", validationStatus: 400 });
  }
}
