import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { writeAudit } from "../_lib/audit.js";
import { runBackup } from "../_lib/backups.js";
import { getDb } from "../_lib/db.js";
import { getClientMeta, handleRouteError, methodNotAllowed, ok, requireAdmin } from "../_lib/http.js";
import { repairProfitFifoCosts } from "../_lib/profitRepair.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const admin = await requireAdmin(req);
    if (req.method !== "POST") return methodNotAllowed(res);

    const body = (req.body ?? {}) as {
      mode?: "dryRun" | "apply";
      suspiciousUnitCostThreshold?: string;
    };
    const mode = body.mode === "apply" ? "apply" : "dryRun";
    const actor = { id: admin.id, username: admin.username, ...getClientMeta(req) };

    const backup = mode === "apply" ? await runBackup("manual", actor) : null;
    const db = getDb();
    const report = await db.transaction((tx) =>
      repairProfitFifoCosts(
        tx,
        {
          mode,
          suspiciousUnitCostThreshold: body.suspiciousUnitCostThreshold
        },
        actor
      )
    );

    if (mode === "dryRun") {
      await writeAudit(db, {
        action: "DRY_RUN_PROFIT_FIFO_COST_REPAIR",
        targetType: "profit_fifo_costs",
        after: report,
        actor
      });
    }

    return ok(res, { report, backup });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "利潤 FIFO 成本修復失敗", validationStatus: 500 });
  }
}
