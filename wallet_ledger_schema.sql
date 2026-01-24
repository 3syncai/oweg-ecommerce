-- Wallet Ledger v2 (Production-grade)
-- Ledger-based wallet with actual_balance and display_balance separation.

CREATE TABLE IF NOT EXISTS wallet_account (
  customer_id VARCHAR(255) PRIMARY KEY,
  actual_balance BIGINT NOT NULL DEFAULT 0, -- minor units (paise)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGSERIAL PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL,
  order_id VARCHAR(255),
  type VARCHAR(10) NOT NULL CHECK (type IN ('EARN', 'SPEND', 'REVERSE')),
  amount BIGINT NOT NULL, -- signed minor units
  reference_id VARCHAR(255),
  idempotency_key VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (amount <> 0)
);

-- Idempotency & correctness
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_order_type_uq
  ON wallet_ledger (order_id, type)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_idempotency_uq
  ON wallet_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Fast lookups
CREATE INDEX IF NOT EXISTS wallet_ledger_customer_idx
  ON wallet_ledger (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wallet_ledger_reference_idx
  ON wallet_ledger (reference_id);
