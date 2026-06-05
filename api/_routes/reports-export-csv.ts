import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { desc } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, requireUser, methodNotAllowed, handleRouteError } from "../_lib/http.js";
import { ledgerEntries } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  try {
    requireUser(req);
    const db = getDb();
    const rows = await db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt)).limit(1000);
    const header = ["id", "createdAt", "entryType", "currency", "direction", "amount", "description"].join(",");
    const csvRows = rows.map((row) => [
      row.id,
      row.createdAt?.toISOString?.() ?? "",
      row.entryType,
      row.currency,
      row.direction,
      row.amount,
      `"${row.description.replaceAll("\"", "\"\"")}"`
    ].join(","));
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", "attachment; filename=rmbsale-ledger.csv");
    return res.status(200).send([header, ...csvRows].join("\n"));
  } catch (error) {
    return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 500 });
  }
}
