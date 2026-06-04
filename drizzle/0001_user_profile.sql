ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "permissions_json" text;

UPDATE "users"
SET "display_name" = "username"
WHERE "display_name" IS NULL OR trim("display_name") = '';

UPDATE "users"
SET "permissions_json" = '["dashboard","purchase","sale","receivables","accounts","transfer","ledger","inventory","admin"]'
WHERE "role" = 'admin' AND ("permissions_json" IS NULL OR trim("permissions_json") = '');

UPDATE "users"
SET "permissions_json" = '["dashboard","purchase","sale","receivables","accounts","transfer","ledger","inventory"]'
WHERE "role" <> 'admin' AND ("permissions_json" IS NULL OR trim("permissions_json") = '');
