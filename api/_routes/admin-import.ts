import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { importBusinessData, type BusinessDataImport } from "../_lib/importBusiness.js";
import { fail, handleRouteError, methodNotAllowed, ok, readJson, requireAdmin } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const admin = await requireAdmin(req);
    if (req.method !== "POST") return methodNotAllowed(res);

    const payload = await readJson<BusinessDataImport>(req);
    if (payload && typeof payload === "object" && "users" in (payload as Record<string, unknown>)) {
      return fail(res, 400, "匯入檔不可包含 users，使用者請在管理後台另行維護");
    }

    await importBusinessData(payload, admin.id);
    return ok(res, { imported: true });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "匯入失敗", validationStatus: 500 });
  }
}
