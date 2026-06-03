import type { VercelRequest, VercelResponse } from "@vercel/node";
import { desc } from "drizzle-orm";
import { getDb } from "../_lib/db";
import { fail, requireUser } from "../_lib/http";
import { ledgerEntries } from "../_lib/schema";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return fail(res, 405, "Method not allowed");
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
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 500, error instanceof Error ? error.message : "Export failed");
  }
}
