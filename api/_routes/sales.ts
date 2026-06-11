import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { createSale, updateSaleProfit } from "../_lib/transactions.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, requireWriteAccess } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "PATCH") return methodNotAllowed(res);
  try {
    const user = await requireWriteAccess(req);
    if (req.method === "PATCH") {
      const body = await readJson<{ id?: number; saleId?: number; profitTwd?: string | number }>(req);
      const sale = await updateSaleProfit(
        {
          saleId: Number(body.id ?? body.saleId),
          profitTwd: String(body.profitTwd ?? "")
        },
        { id: user.id, ...getClientMeta(req) }
      );
      return ok(res, { sale });
    }

    const sale = await createSale(await readJson(req), { id: user.id, ...getClientMeta(req) });
    return ok(res, { sale }, 201);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "售出失敗" });
  }
}
