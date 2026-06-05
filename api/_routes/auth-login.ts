import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { ensureUserProfileColumns } from "../_lib/ensureUserColumns.js";
import { AuditAction, writeAudit } from "../_lib/audit.js";
import { fail, getClientMeta, handleRouteError, methodNotAllowed, ok, readJson, setSessionCookie, signSession } from "../_lib/http.js";
import { users } from "../_lib/schema.js";
import { deriveRole, toAppUser } from "../_lib/userPermissions.js";

type LoginBody = {
  username: string;
  password: string;
};

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const body = await readJson<LoginBody>(req);
    const loginName = body.username?.trim() ?? "";
    const meta = getClientMeta(req);
    await ensureUserProfileColumns();
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.username, loginName));

    if (!user || !user.isActive) {
      await writeAudit(db, {
        action: AuditAction.LOGIN_FAILED,
        targetType: "user",
        targetId: user?.id ?? null,
        actor: { username: loginName, ...meta }
      });
      return fail(res, 401, "帳號或密碼錯誤");
    }
    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      await writeAudit(db, {
        action: AuditAction.LOGIN_FAILED,
        targetType: "user",
        targetId: user.id,
        actor: { username: loginName, ...meta }
      });
      return fail(res, 401, "帳號或密碼錯誤");
    }

    await writeAudit(db, {
      action: AuditAction.LOGIN_SUCCESS,
      targetType: "user",
      targetId: user.id,
      actor: { id: user.id, username: user.username, ...meta }
    });

    const appUser = toAppUser(user);
    setSessionCookie(res, signSession({ id: appUser.id, username: appUser.username, role: deriveRole(appUser.permissions) }));
    return ok(res, { user: appUser });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "登入失敗", validationStatus: 500 });
  }
}
