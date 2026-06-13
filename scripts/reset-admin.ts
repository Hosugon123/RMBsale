/**
 * 重設線上／本機資料庫管理員帳密（預設 ds6186 / 1234）。
 * 需 .env.local 含 DATABASE_URL，或已 vercel env pull。
 *
 *   ADMIN_USERNAME=ds6186 ADMIN_PASSWORD=1234 npm run db:reset-admin
 */
import "./loadEnv.ts";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../api/_lib/db";
import { users } from "../api/_lib/schema";
import { ALL_PERMISSIONS, serializePermissions } from "../api/_lib/userPermissions";

const username = process.env.ADMIN_USERNAME?.trim() || "ds6186";
const password = process.env.ADMIN_PASSWORD?.trim() || "1234";
const passwordHash = await bcrypt.hash(password, 12);
const db = getDb();
const adminPermissions = serializePermissions([...ALL_PERMISSIONS]);

let [admin] = await db.select().from(users).where(eq(users.username, username));
if (!admin) {
  const [legacyUser] = await db
    .select()
    .from(users)
    .where(inArray(users.username, ["admin", "ds001"]))
    .limit(1);
  if (legacyUser) {
    [admin] = await db
      .update(users)
      .set({
        username,
        passwordHash,
        role: "admin",
        isActive: true,
        displayName: "系統管理員",
        permissionsJson: adminPermissions
      })
      .where(eq(users.id, legacyUser.id))
      .returning();
    console.log(`已將 ${legacyUser.username} 更名為 ${username}`);
  } else {
    [admin] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        role: "admin",
        isActive: true,
        displayName: "系統管理員",
        permissionsJson: adminPermissions
      })
      .returning();
    console.log(`已建立管理員 ${username}`);
  }
} else {
  await db
    .update(users)
    .set({
      passwordHash,
      role: "admin",
      isActive: true,
      displayName: admin.displayName ?? "系統管理員",
      permissionsJson: admin.permissionsJson ?? adminPermissions
    })
    .where(eq(users.id, admin.id));
  console.log(`已更新 ${username} 密碼`);
}

console.log(`完成。請用 ${username} / ${password} 登入，並確認 Vercel 環境變數 ADMIN_USERNAME、ADMIN_PASSWORD 一致。`);
