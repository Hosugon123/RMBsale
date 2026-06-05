import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { asc } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, readJson, requireUser, methodNotAllowed, handleRouteError } from "../_lib/http.js";
import { createHolderRecord } from "../_lib/transactions.js";
import { holders } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    requireUser(req);
    const db = getDb();
    if (req.method === "GET") {
      return ok(res, { holders: await db.select().from(holders).orderBy(asc(holders.name)) });
    }
    if (req.method === "POST") {
      const body = await readJson<{ name: string }>(req);
      const holder = await createHolderRecord(body);
      return ok(res, { holder }, 201);
    }
    return methodNotAllowed(res);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "操作失敗" });
  }
}
