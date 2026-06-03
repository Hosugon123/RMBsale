import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../_lib/db";
import { fail, ok, readJson, requireAdmin } from "../_lib/http";
import { users } from "../_lib/schema";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    requireAdmin(req);
    const db = getDb();

    if (req.method === "GET") {
      const rows = await db.select({
        id: users.id,
        username: users.username,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt
      }).from(users).orderBy(asc(users.username));
      return ok(res, { users: rows });
    }

    if (req.method === "POST") {
      const body = await readJson<{ username: string; password: string; role: "admin" | "operator" }>(req);
      const passwordHash = await bcrypt.hash(body.password, 12);
      const [user] = await db.insert(users).values({ username: body.username, passwordHash, role: body.role }).returning({
        id: users.id,
        username: users.username,
        role: users.role,
        isActive: users.isActive
      });
      return ok(res, { user }, 201);
    }

    if (req.method === "PATCH") {
      const body = await readJson<{ id: number; role?: "admin" | "operator"; isActive?: boolean; password?: string }>(req);
      const patch: Partial<typeof users.$inferInsert> = {};
      if (body.role) patch.role = body.role;
      if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
      if (body.password) patch.passwordHash = await bcrypt.hash(body.password, 12);
      const [user] = await db.update(users).set(patch).where(eq(users.id, body.id)).returning({
        id: users.id,
        username: users.username,
        role: users.role,
        isActive: users.isActive
      });
      return ok(res, { user });
    }

    return fail(res, 405, "Method not allowed");
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 403, error instanceof Error ? error.message : "Users failed");
  }
}
