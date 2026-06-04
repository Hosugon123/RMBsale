CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "username" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'operator' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "holders" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "customers" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "is_active" boolean DEFAULT true NOT NULL,
  "receivable_twd" numeric(14, 2) DEFAULT '0' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "channels" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "holder_id" integer NOT NULL REFERENCES "holders"("id"),
  "name" text NOT NULL,
  "currency" text NOT NULL,
  "balance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "profit_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "accounts_holder_currency_idx" ON "accounts" ("holder_id", "currency");
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_holder_name_idx" ON "accounts" ("holder_id", "name");

CREATE TABLE IF NOT EXISTS "purchases" (
  "id" serial PRIMARY KEY NOT NULL,
  "channel_id" integer REFERENCES "channels"("id"),
  "payment_account_id" integer REFERENCES "accounts"("id"),
  "deposit_account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "rmb_amount" numeric(14, 2) NOT NULL,
  "exchange_rate" numeric(12, 6) NOT NULL,
  "twd_cost" numeric(14, 2) NOT NULL,
  "payment_status" text DEFAULT 'paid' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "operator_id" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rmb_lots" (
  "id" serial PRIMARY KEY NOT NULL,
  "purchase_id" integer NOT NULL REFERENCES "purchases"("id"),
  "account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "original_rmb" numeric(14, 2) NOT NULL,
  "remaining_rmb" numeric(14, 2) NOT NULL,
  "unit_cost_twd" numeric(14, 6) NOT NULL,
  "exchange_rate" numeric(12, 6) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "rmb_lots_fifo_idx" ON "rmb_lots" ("account_id", "created_at");

CREATE TABLE IF NOT EXISTS "sales" (
  "id" serial PRIMARY KEY NOT NULL,
  "customer_id" integer NOT NULL REFERENCES "customers"("id"),
  "rmb_account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "rmb_amount" numeric(14, 2) NOT NULL,
  "exchange_rate" numeric(12, 6) NOT NULL,
  "twd_amount" numeric(14, 2) NOT NULL,
  "cost_twd" numeric(14, 2) NOT NULL,
  "profit_twd" numeric(14, 2) NOT NULL,
  "settlement_status" text DEFAULT 'unsettled' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "operator_id" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sale_allocations" (
  "id" serial PRIMARY KEY NOT NULL,
  "sale_id" integer NOT NULL REFERENCES "sales"("id"),
  "lot_id" integer NOT NULL REFERENCES "rmb_lots"("id"),
  "allocated_rmb" numeric(14, 2) NOT NULL,
  "allocated_cost_twd" numeric(14, 2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "settlements" (
  "id" serial PRIMARY KEY NOT NULL,
  "customer_id" integer NOT NULL REFERENCES "customers"("id"),
  "account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "amount_twd" numeric(14, 2) NOT NULL,
  "note" text,
  "status" text DEFAULT 'active' NOT NULL,
  "operator_id" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "transfers" (
  "id" serial PRIMARY KEY NOT NULL,
  "from_account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "to_account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "amount" numeric(14, 2) NOT NULL,
  "note" text,
  "status" text DEFAULT 'active' NOT NULL,
  "operator_id" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "entry_type" text NOT NULL,
  "account_id" integer REFERENCES "accounts"("id"),
  "customer_id" integer REFERENCES "customers"("id"),
  "related_table" text,
  "related_id" integer,
  "direction" text DEFAULT 'none' NOT NULL,
  "currency" text NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "balance_before" numeric(14, 2),
  "balance_after" numeric(14, 2),
  "description" text NOT NULL,
  "is_reversal" boolean DEFAULT false NOT NULL,
  "reverses_ledger_id" integer,
  "operator_id" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ledger_created_idx" ON "ledger_entries" ("created_at");
CREATE INDEX IF NOT EXISTS "ledger_related_idx" ON "ledger_entries" ("related_table", "related_id");

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" integer,
  "before_json" text,
  "after_json" text,
  "ip_address" text,
  "user_agent" text,
  "operator_id" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
