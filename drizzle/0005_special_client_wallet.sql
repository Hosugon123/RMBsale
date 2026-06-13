CREATE TABLE IF NOT EXISTS special_clients (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  fee_rate numeric(8, 6) NOT NULL DEFAULT 0.011000,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS special_client_wallet_entries (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES special_clients(id),
  type text NOT NULL CHECK (type IN ('deposit', 'payout')),
  entry_date date NOT NULL,
  usd_amount numeric(14, 2),
  usd_to_rmb_rate numeric(12, 6),
  gross_rmb numeric(14, 2),
  fee_rate numeric(8, 6),
  fee_rmb numeric(14, 2),
  net_credit_rmb numeric(14, 2),
  payout_rmb numeric(14, 2),
  vendor_name text,
  purpose text,
  cash_account_id integer NOT NULL REFERENCES accounts(id),
  cash_account_delta numeric(14, 2) NOT NULL,
  balance_after_rmb numeric(14, 2) NOT NULL,
  profit_ledger_id integer REFERENCES ledger_entries(id),
  note text,
  created_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by integer REFERENCES users(id),
  reverse_reason text,
  original_entry_id integer REFERENCES special_client_wallet_entries(id),
  reversal_entry_id integer REFERENCES special_client_wallet_entries(id)
);

CREATE INDEX IF NOT EXISTS special_client_wallet_entries_client_idx
  ON special_client_wallet_entries (client_id, entry_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS special_client_wallet_entries_created_idx
  ON special_client_wallet_entries (created_at DESC);

INSERT INTO special_clients (name, fee_rate)
VALUES ('特殊客戶', 0.011000)
ON CONFLICT (name) DO NOTHING;
