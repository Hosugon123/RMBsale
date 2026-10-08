ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_balance_nonnegative;
ALTER TABLE accounts ADD CONSTRAINT accounts_balance_nonnegative CHECK (balance >= 0) NOT VALID;

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_amounts_positive;
ALTER TABLE purchases ADD CONSTRAINT purchases_amounts_positive CHECK (rmb_amount > 0 AND exchange_rate > 0 AND twd_cost > 0) NOT VALID;

ALTER TABLE rmb_lots DROP CONSTRAINT IF EXISTS rmb_lots_valid_amounts;
ALTER TABLE rmb_lots ADD CONSTRAINT rmb_lots_valid_amounts CHECK (
  original_rmb > 0 AND remaining_rmb >= 0 AND remaining_rmb <= original_rmb AND unit_cost_twd >= 0
) NOT VALID;

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_valid_amounts;
ALTER TABLE sales ADD CONSTRAINT sales_valid_amounts CHECK (
  rmb_amount > 0 AND exchange_rate > 0 AND twd_amount > 0 AND cost_twd >= 0
) NOT VALID;

ALTER TABLE sale_allocations DROP CONSTRAINT IF EXISTS sale_allocations_valid_amounts;
ALTER TABLE sale_allocations ADD CONSTRAINT sale_allocations_valid_amounts CHECK (allocated_rmb > 0 AND allocated_cost_twd >= 0) NOT VALID;

ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_amount_positive;
ALTER TABLE settlements ADD CONSTRAINT settlements_amount_positive CHECK (amount_twd > 0) NOT VALID;

ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_amount_positive;
ALTER TABLE transfers ADD CONSTRAINT transfers_amount_positive CHECK (amount > 0 AND from_account_id <> to_account_id) NOT VALID;

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_amount_nonnegative;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_amount_nonnegative CHECK (amount >= 0) NOT VALID;
