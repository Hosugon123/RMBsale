import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { ensureUserProfileColumns } from "../_lib/ensureUserColumns.js";
import { fail, handleRouteError, methodNotAllowed, ok, readJson, setSessionCookie, signSession } from "../_lib/http.js";
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
    await ensureUserProfileColumns();
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.username, loginName));

    if (!user || !user.isActive) return fail(res, 401, "帳號或密碼錯誤");
    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) return fail(res, 401, "帳號或密碼錯誤");

    const appUser = toAppUser(user);
    setSessionCookie(res, signSession({ id: appUser.id, username: appUser.username, role: deriveRole(appUser.permissions) }));
    return ok(res, { user: appUser });
  } catch (error) {
    return handleRouteError(res, error, { fallback: "登入失敗", validationStatus: 500 });
  }
}
