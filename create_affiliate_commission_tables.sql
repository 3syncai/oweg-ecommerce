-- Affiliate Commission System - Database Tables
-- Run this SQL in your database

-- 1. Track referred customers
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  affiliate_code TEXT NOT NULL,           -- The affiliate's refer_code
  affiliate_user_id TEXT,                 -- ID from affiliate_user table (if exists)
  customer_id TEXT NOT NULL,              -- Referred customer's ID
  customer_email TEXT,                    -- For display
  customer_name TEXT,                     -- Customer's name
  referred_at TIMESTAMP DEFAULT NOW(),
  first_order_at TIMESTAMP,               -- When customer first ordered
  total_orders INTEGER DEFAULT 0,
  total_order_value NUMERIC(12,2) DEFAULT 0,
  total_commission NUMERIC(12,2) DEFAULT 0,
  UNIQUE(affiliate_code, customer_id)
);

-- 2. Track commission per transaction
CREATE TABLE IF NOT EXISTS affiliate_commission_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  affiliate_code TEXT NOT NULL,
  affiliate_user_id TEXT,
  order_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT,
  variant_id TEXT,
  quantity INTEGER DEFAULT 1,
  item_price NUMERIC(12,2),               -- Price of the item
  order_amount NUMERIC(12,2),             -- Total for this line item (price * quantity)
  commission_rate NUMERIC(5,2),           -- Percentage (e.g., 5.00 for 5%)
  commission_amount NUMERIC(12,2),        -- Actual amount earned
  commission_source TEXT,                 -- 'product', 'category', 'collection'
  category_id TEXT,                       -- For reference
  collection_id TEXT,                     -- For reference
  status TEXT DEFAULT 'PENDING',          -- PENDING, CREDITED, REVERSED
  credited_at TIMESTAMP,
  unlock_at TIMESTAMP,                    -- When commission becomes usable (5 min after delivery)
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate_code ON affiliate_referrals(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_customer_id ON affiliate_referrals(customer_id);
CREATE INDEX IF NOT EXISTS idx_commission_log_affiliate_code ON affiliate_commission_log(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_commission_log_order_id ON affiliate_commission_log(order_id);
CREATE INDEX IF NOT EXISTS idx_commission_log_status ON affiliate_commission_log(status);

-- Verify tables created
SELECT 'Affiliate commission tables created successfully!' as status;
