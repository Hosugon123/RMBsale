import { sql } from "drizzle-orm";
import { getDb } from "./db.js";

let ensured = false;

/** 線上 DB 若尚未跑 0002 migration，自動補欄位與新表，避免 bootstrap 500。 */
export async function ensureAuditBackupSchema() {
  if (ensured) return;
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "username" text`);

    for (const table of [
      "sales",
      "purchases",
      "settlements",
      "transfers",
      "ledger_entries",
      "accounts",
      "holders",
      "customers"
    ]) {
      await tx.execute(sql.raw(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz`));
      await tx.execute(
        sql.raw(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id")`)
      );
      await tx.execute(sql.raw(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "delete_reason" text`));
    }

    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS "daily_snapshots" (
        "id" serial PRIMARY KEY NOT NULL,
        "snapshot_date" date NOT NULL,
        "total_twd_balance" numeric(14, 2) NOT NULL,
        "total_rmb_balance" numeric(14, 2) NOT NULL,
        "total_receivables_twd" numeric(14, 2) NOT NULL,
        "total_receivables_rmb" numeric(14, 2) NOT NULL DEFAULT '0',
        "total_payables_twd" numeric(14, 2) NOT NULL,
        "total_payables_rmb" numeric(14, 2) NOT NULL DEFAULT '0',
        "open_sales_count" integer NOT NULL DEFAULT 0,
        "open_purchases_count" integer NOT NULL DEFAULT 0,
        "ledger_entries_count" integer NOT NULL DEFAULT 0,
        "checksum" text NOT NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        CONSTRAINT "daily_snapshots_date_unique" UNIQUE("snapshot_date")
      )
    `);

    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS "backup_runs" (
        "id" serial PRIMARY KEY NOT NULL,
        "type" text NOT NULL,
        "status" text NOT NULL,
        "started_at" timestamptz NOT NULL,
        "finished_at" timestamptz,
        "file_name" text,
        "file_size" bigint,
        "storage_target" text NOT NULL,
        "storage_path" text,
        "error_message" text,
        "created_by" integer REFERENCES "users"("id"),
        "created_at" timestamptz DEFAULT now() NOT NULL
      )
    `);

    await tx.execute(sql`CREATE INDEX IF NOT EXISTS "backup_runs_started_idx" ON "backup_runs" ("started_at" DESC)`);
    await tx.execute(sql`CREATE INDEX IF NOT EXISTS "audit_logs_created_idx" ON "audit_logs" ("created_at" DESC)`);
    await tx.execute(sql`ALTER TABLE "rmb_lots" ADD COLUMN IF NOT EXISTS "transfer_id" integer`);
  });
  ensured = true;
}

let inventoryReconciled = false;

/** 一次性對齊帳戶餘額與 FIFO 批次（修正內轉未搬移批次的歷史資料）。 */
export async function ensureRmbLotInventorySchema(operatorId = 1) {
  if (inventoryReconciled) return;
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`ALTER TABLE "rmb_lots" ADD COLUMN IF NOT EXISTS "transfer_id" integer`);
    const { reconcileRmbLotInventory } = await import("./rmbInventory.js");
    await reconcileRmbLotInventory(tx, operatorId);
  });
  inventoryReconciled = true;
}
