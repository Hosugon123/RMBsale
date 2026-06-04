import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, readJson, setSessionCookie, signSession } from "../_lib/http.js";
import { users } from "../_lib/schema.js";

type LoginBody = {
  username: string;
  password: string;
};

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");

  try {
    const body = await readJson<LoginBody>(req);
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.username, body.username));

    if (!user || !user.isActive) return fail(res, 401, "帳號或密碼錯誤");
    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) return fail(res, 401, "帳號或密碼錯誤");

    const sessionUser = { id: user.id, username: user.username, role: user.role };
    setSessionCookie(res, signSession(sessionUser));
    return ok(res, { user: sessionUser });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Login failed");
  }
}
