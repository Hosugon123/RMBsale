import { sql } from "drizzle-orm";
import { getDb } from "./db.js";

let ensured = false;

/** 線上 DB 若尚未跑 migration，自動補上使用者欄位，避免 bootstrap 500。 */
export async function ensureUserProfileColumns() {
  if (ensured) return;
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text`);
    await tx.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "permissions_json" text`);
    await tx.execute(sql`
      UPDATE "users"
      SET "display_name" = "username"
      WHERE "display_name" IS NULL OR trim("display_name") = ''
    `);
    await tx.execute(sql`
      UPDATE "users"
      SET "permissions_json" = '["dashboard","purchase","sale","receivables","accounts","transfer","ledger","inventory","admin"]'
      WHERE "role" = 'admin' AND ("permissions_json" IS NULL OR trim("permissions_json") = '')
    `);
    await tx.execute(sql`
      UPDATE "users"
      SET "permissions_json" = '["dashboard","purchase","sale","receivables","accounts","transfer","ledger","inventory"]'
      WHERE "role" <> 'admin' AND ("permissions_json" IS NULL OR trim("permissions_json") = '')
    `);
  });
  ensured = true;
}
