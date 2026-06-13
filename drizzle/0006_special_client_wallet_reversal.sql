ALTER TABLE special_client_wallet_entries
  DROP CONSTRAINT IF EXISTS special_client_wallet_entries_type_check;

ALTER TABLE special_client_wallet_entries
  ADD CONSTRAINT special_client_wallet_entries_type_check
  CHECK (type IN ('deposit', 'payout', 'reversal'));
