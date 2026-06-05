import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, handleRouteError, methodNotAllowed, ok, readJson, requireAdmin, requireUser, setSessionCookie, signSession } from "../_lib/http.js";
import { users } from "../_lib/schema.js";
import {
  deriveRole,
  normalizePermissionsInput,
  parsePermissionsJson,
  serializePermissions,
  toAppUser
} from "../_lib/userPermissions.js";

type CreateBody = {
  username: string;
  password: string;
  displayName: string;
  permissions: unknown;
};

type PatchBody = {
  id: number;
  username?: string;
  password?: string;
  displayName?: string;
  permissions?: unknown;
  isActive?: boolean;
};

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const db = getDb();

    if (req.method === "GET") {
      await requireAdmin(req);
      const rows = await db.select().from(users).orderBy(asc(users.username));
      return ok(res, { users: rows.map(toAppUser) });
    }

    if (req.method === "POST") {
      await requireAdmin(req);
      const body = await readJson<CreateBody>(req);
      const username = body.username?.trim() ?? "";
      const displayName = body.displayName?.trim() ?? "";
      const password = body.password ?? "";
      if (!username) return fail(res, 400, "請輸入帳號");
      if (!displayName) return fail(res, 400, "請輸入名稱");
      if (password.length < 4) return fail(res, 400, "密碼至少 4 碼");

      let permissions;
      try {
        permissions = normalizePermissionsInput(body.permissions);
      } catch (error) {
        return fail(res, 400, error instanceof Error ? error.message : "權限格式錯誤");
      }

      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.username}) = lower(${username})`);
      if (existing) return fail(res, 400, "帳號已存在");

      const role = deriveRole(permissions);
      const passwordHash = await bcrypt.hash(password, 12);
      const [row] = await db
        .insert(users)
        .values({
          username,
          displayName,
          passwordHash,
          role,
          permissionsJson: serializePermissions(permissions),
          isActive: true
        })
        .returning();

      return ok(res, { user: toAppUser(row) }, 201);
    }

    if (req.method === "PATCH") {
      await requireAdmin(req);
      const session = requireUser(req);
      const body = await readJson<PatchBody>(req);
      const targetId = Number(body.id);
      if (!targetId) return fail(res, 400, "缺少使用者 id");

      const [target] = await db.select().from(users).where(eq(users.id, targetId));
      if (!target) return fail(res, 404, "找不到使用者");

      const isSelf = targetId === session.id;

      const username = body.username !== undefined ? body.username.trim() : target.username;
      const displayName = body.displayName !== undefined ? body.displayName.trim() : target.displayName ?? target.username;
      const password = body.password?.trim() ?? "";

      if (!username) return fail(res, 400, "請輸入帳號");
      if (!displayName) return fail(res, 400, "請輸入名稱");
      if (password && password.length < 4) return fail(res, 400, "密碼至少 4 碼");

      let permissions = parsePermissionsJson(target.permissionsJson, target.role);
      if (body.permissions !== undefined) {
        try {
          permissions = normalizePermissionsInput(body.permissions);
        } catch (error) {
          return fail(res, 400, error instanceof Error ? error.message : "權限格式錯誤");
        }
      }

      if (isSelf && !permissions.includes("admin")) {
        return fail(res, 400, "無法移除自己的管理後台權限");
      }
      if (isSelf && body.isActive === false) {
        return fail(res, 400, "無法停用自己的帳號");
      }

      const [duplicate] = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.username}) = lower(${username}) and ${users.id} <> ${targetId}`);
      if (duplicate) return fail(res, 400, "帳號已存在");

      const patch: Partial<typeof users.$inferInsert> = {
        username,
        displayName,
        role: deriveRole(permissions),
        permissionsJson: serializePermissions(permissions)
      };
      if (password) patch.passwordHash = await bcrypt.hash(password, 12);
      if (typeof body.isActive === "boolean") patch.isActive = body.isActive;

      const [row] = await db.update(users).set(patch).where(eq(users.id, targetId)).returning();
      const user = toAppUser(row);

      if (isSelf) {
        setSessionCookie(res, signSession({ id: user.id, username: user.username, role: user.role }));
      }

      return ok(res, { user });
    }

    return methodNotAllowed(res);
  } catch (error) {
    return handleRouteError(res, error, { fallback: "使用者操作失敗", validationStatus: 500 });
  }
}
