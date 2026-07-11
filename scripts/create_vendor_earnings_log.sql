-- Vendor earnings unlock log (5-minute hold after delivery before payout credit)
CREATE TABLE IF NOT EXISTS vendor_earnings_log (
  id text PRIMARY KEY,
  vendor_id text NOT NULL,
  order_id text NOT NULL,
  order_display_id text,
  gross_amount numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 2,
  commission_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  currency_code text NOT NULL DEFAULT 'inr',
  status text NOT NULL DEFAULT 'UNLOCKING',
  delivered_at timestamptz,
  unlock_at timestamptz,
  credited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_earnings_vendor_order
  ON vendor_earnings_log (vendor_id, order_id);

CREATE INDEX IF NOT EXISTS idx_vendor_earnings_vendor_status
  ON vendor_earnings_log (vendor_id, status);

CREATE INDEX IF NOT EXISTS idx_vendor_earnings_unlock_at
  ON vendor_earnings_log (unlock_at)
  WHERE status = 'UNLOCKING';

-- Processed vendor withdrawals (admin Razorpay payouts)
CREATE TABLE IF NOT EXISTS vendor_payout (
  id text PRIMARY KEY,
  vendor_id text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 2,
  currency_code text NOT NULL DEFAULT 'inr',
  transaction_id text,
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  status text NOT NULL DEFAULT 'pending',
  razorpay_contact_id text,
  razorpay_fund_account_id text,
  razorpay_payout_id text,
  razorpay_status text,
  utr text,
  failure_reason text,
  notes text,
  order_ids jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_vendor_payout_vendor_id ON vendor_payout (vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payout_status ON vendor_payout (status);
