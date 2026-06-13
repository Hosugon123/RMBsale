import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { exportSpecialClientWalletXlsx, type WalletEntryTypeFilter } from "../_lib/specialClientWallet.js";
import { getClientMeta, methodNotAllowed, handleRouteError, requireUser } from "../_lib/http.js";

function parseQuery(req: VercelRequest) {
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
    const user = await requireUser(req);
    const { buffer, filename } = await exportSpecialClientWalletXlsx(parseQuery(req), {
      id: user.id,
      ...getClientMeta(req)
    });
    res.setHeader("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("content-disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "匯出失敗", validationStatus: 400 });
  }
}
