import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { fail, getClientMeta, handleRouteError, methodNotAllowed, ok, requireAdmin } from "../_lib/http.js";
import {
  getBackupRun,
  getBackupStorageMode,
  listBackupRuns,
  readBackupFile,
  runBackup,
  runScheduledBackup,
  type BackupType
} from "../_lib/backups.js";

function cronAuthorized(req: VercelRequest) {
  const secret = process.env.BACKUP_CRON_SECRET;
  if (!secret) return false;
  const header = req.headers["x-cron-secret"];
  return String(Array.isArray(header) ? header[0] : header ?? "") === secret;
}

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const path = String(req.query.path ?? "");
    const downloadId = typeof req.query.id === "string" ? Number(req.query.id) : undefined;

    if (req.method === "POST" && path.endsWith("/scheduled")) {
      if (!cronAuthorized(req)) return fail(res, 403, "排程備份驗證失敗");
      const type = req.query.type === "monthly" ? "monthly" : "daily";
      const result = await runScheduledBackup(type);
      return ok(res, result, 201);
    }

    if (req.method === "POST" && path.endsWith("/run")) {
      const admin = await requireAdmin(req);
      const meta = getClientMeta(req);
      const result = await runBackup("manual", { id: admin.id, username: admin.username, ...meta });
      return ok(res, result, 201);
    }

    if (req.method === "GET" && (path.endsWith("/download") || downloadId)) {
      const admin = await requireAdmin(req);
      void admin;
      const id = downloadId ?? Number(path.replace("download/", ""));
      if (!id) return fail(res, 400, "請提供備份 id");
      const run = await getBackupRun(id);
      if (!run || run.status !== "success") return fail(res, 404, "找不到可下載的備份");
      const content = await readBackupFile(run);
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("content-disposition", `attachment; filename=${run.fileName ?? "backup.json"}`);
      return res.status(200).send(content);
    }

    if (req.method === "GET") {
      const admin = await requireAdmin(req);
      void admin;
      const runs = await listBackupRuns();
      return ok(res, {
        storageMode: getBackupStorageMode(),
        runs
      });
    }

    return methodNotAllowed(res);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "備份操作失敗", validationStatus: 500 });
  }
}
