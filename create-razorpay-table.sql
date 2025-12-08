-- Create razorpay_payment table
CREATE TABLE IF NOT EXISTS razorpay_payment (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  razorpay_payment_id TEXT NOT NULL UNIQUE,
  razorpay_order_id TEXT NOT NULL,
  medusa_order_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL,
  payment_mode TEXT NULL,  -- upi, card, netbanking, wallet, etc.
  method TEXT NULL,
  email TEXT NULL,
  contact TEXT NULL,
  captured BOOLEAN NOT NULL DEFAULT false,
  fee INTEGER NULL,
  tax INTEGER NULL,
  error_code TEXT NULL,
  error_description TEXT NULL,
  notes JSONB NULL,
  reconciled_at TIMESTAMPTZ NULL,
  reconciled_manually BOOLEAN NOT NULL DEFAULT false,
  webhook_received_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  metadata JSONB NULL
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_razorpay_payment_razorpay_payment_id ON razorpay_payment(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_payment_razorpay_order_id ON razorpay_payment(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_payment_medusa_order_id ON razorpay_payment(medusa_order_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_payment_status ON razorpay_payment(status);
CREATE INDEX IF NOT EXISTS idx_razorpay_payment_created_at ON razorpay_payment(created_at);
CREATE INDEX IF NOT EXISTS idx_razorpay_payment_deleted_at ON razorpay_payment(deleted_at) WHERE deleted_at IS NULL;

-- Add comment to table
COMMENT ON TABLE razorpay_payment IS 'Stores Razorpay payment records with full payment details';
COMMENT ON COLUMN razorpay_payment.payment_mode IS 'Payment method used: upi, card, netbanking, wallet, etc.';
