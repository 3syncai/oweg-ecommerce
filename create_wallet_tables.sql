-- Wallet System Database Tables
-- Run this in your PostgreSQL database (oweg_db)

-- Table 1: Customer Wallet - stores current balance
CREATE TABLE IF NOT EXISTS customer_wallet (
  id SERIAL PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL UNIQUE,
  coins_balance DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table 2: Wallet Transactions - tracks all coin movements
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id SERIAL PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL,
  order_id VARCHAR(255),
  transaction_type VARCHAR(20) NOT NULL, -- 'EARNED' or 'REDEEMED'
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  expiry_date TIMESTAMP,    -- For EARNED: created_at + 1 year
  status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE', 'EXPIRED', 'USED'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_customer ON customer_wallet(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON wallet_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_expiry ON wallet_transactions(expiry_date);

-- Verify tables created
SELECT 'Tables created successfully!' as status;
ALTER TABLE wallet_transactions 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';