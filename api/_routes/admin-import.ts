import type { VercelRequest, VercelResponse } from "@vercel/node";
import { importBusinessData, type BusinessDataImport } from "../_lib/importBusiness.js";
import { fail, ok, readJson, requireAdmin } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const admin = await requireAdmin(req);
    if (req.method !== "POST") return fail(res, 405, "Method not allowed");

    const payload = await readJson<BusinessDataImport>(req);
    if (payload && typeof payload === "object" && "users" in (payload as Record<string, unknown>)) {
      return fail(res, 400, "匯入檔不可包含 users，使用者請在管理後台另行維護");
    }

    await importBusinessData(payload, admin.id);
    return ok(res, { imported: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    if (message === "Unauthorized") return fail(res, 401, message);
    if (message === "Admin permission is required") return fail(res, 403, message);
    return fail(res, 500, message);
  }
}
