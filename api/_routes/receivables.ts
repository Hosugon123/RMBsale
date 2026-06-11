import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { desc, gt } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { createOpeningReceivable } from "../_lib/transactions.js";
import { getClientMeta, ok, requireUser, methodNotAllowed, handleRouteError, readJson, requireWriteAccess } from "../_lib/http.js";
import { customers } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res);
  try {
    if (req.method === "POST") {
      const user = await requireWriteAccess(req);
      const result = await createOpeningReceivable(await readJson(req), { id: user.id, ...getClientMeta(req) });
      return ok(res, result, 201);
    }

    requireUser(req);
    const db = getDb();
    return ok(res, { receivables: await db.select().from(customers).where(gt(customers.receivableTwd, "0")).orderBy(desc(customers.receivableTwd)) });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 500 });
  }
}
