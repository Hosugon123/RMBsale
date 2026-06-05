-- Audit log 強化
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "username" text;

-- Soft delete 欄位
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id");
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "delete_reason" text;

ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id");
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "delete_reason" text;

ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id");
ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "delete_reason" text;

ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id");
ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "delete_reason" text;

ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id");
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "delete_reason" text;

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id");
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "delete_reason" text;

ALTER TABLE "holders" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "holders" ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id");
ALTER TABLE "holders" ADD COLUMN IF NOT EXISTS "delete_reason" text;

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id");
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "delete_reason" text;

-- 每日財務快照
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
);

-- 備份執行紀錄
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
);

CREATE INDEX IF NOT EXISTS "backup_runs_started_idx" ON "backup_runs" ("started_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_created_idx" ON "audit_logs" ("created_at" DESC);
