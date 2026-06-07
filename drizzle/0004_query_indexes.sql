-- 查詢效能索引
CREATE INDEX IF NOT EXISTS "rmb_lots_inventory_idx" ON "rmb_lots" ("account_id", "remaining_rmb", "created_at");
CREATE INDEX IF NOT EXISTS "sales_status_created_idx" ON "sales" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "purchases_status_created_idx" ON "purchases" ("status", "created_at" DESC);
