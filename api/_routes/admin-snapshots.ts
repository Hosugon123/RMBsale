import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { fail, getClientMeta, handleRouteError, methodNotAllowed, ok, requireAdmin } from "../_lib/http.js";
import {
  compareDailySnapshots,
  createDailySnapshot,
  getDailySnapshotByDate,
  listDailySnapshots
} from "../_lib/snapshots.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const admin = await requireAdmin(req);
    const meta = getClientMeta(req);
    const actor = { id: admin.id, username: admin.username, ...meta };
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const path = String(req.query.path ?? "");

    if (req.method === "POST" && path.endsWith("/create")) {
      const snapshot = await createDailySnapshot(actor);
      return ok(res, { snapshot }, 201);
    }

    if (req.method === "GET" && from && to) {
      const comparison = await compareDailySnapshots(from, to);
      return ok(res, comparison);
    }

    if (req.method === "GET" && date) {
      const snapshot = await getDailySnapshotByDate(date);
      if (!snapshot) return fail(res, 404, "找不到該日快照");
      return ok(res, { snapshot });
    }

    if (req.method === "GET") {
      const snapshots = await listDailySnapshots();
      return ok(res, { snapshots });
    }

    return methodNotAllowed(res);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "快照操作失敗", validationStatus: 500 });
  }
}
