import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { eq } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, requireUser, methodNotAllowed } from "../_lib/http.js";
import { users } from "../_lib/schema.js";
import { toAppUser } from "../_lib/userPermissions.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  try {
    const session = requireUser(req);
    const db = getDb();
    const [row] = await db.select().from(users).where(eq(users.id, session.id));
    if (!row?.isActive) return ok(res, { user: null });
    return ok(res, { user: toAppUser(row) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized" || message.includes("jwt")) {
      return ok(res, { user: null });
    }
    return fail(res, 500, message || "驗證登入狀態失敗");
  }
}
