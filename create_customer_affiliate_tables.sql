-- ============================================================
-- OWEG Customer-Referrer (customer-as-affiliate) program
--
-- This is a NEW system that lets a regular OWEG customer earn
-- coins by referring other customers. It is fully independent
-- from:
--   - the legacy OpenCart-style `customer_affiliate` table
--   - the agent-side `affiliate_user` system in my-medusa-store
--
-- All tables in this file use the `customer_referrer` prefix to
-- avoid colliding with either of those existing systems.
-- ============================================================

-- 1. The customer-referrer record (one per Medusa customer)
CREATE TABLE IF NOT EXISTS customer_referrer (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id   TEXT NOT NULL UNIQUE,         -- Medusa customer id
  refer_code    TEXT NOT NULL UNIQUE,         -- Shareable referral code
  email         TEXT,
  name          TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  earned_coins  NUMERIC(12,2) DEFAULT 0,      -- Total coins credited
  pending_coins NUMERIC(12,2) DEFAULT 0,      -- Coins waiting to unlock
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_referrer_refer_code ON customer_referrer(refer_code);
CREATE INDEX IF NOT EXISTS idx_customer_referrer_customer_id ON customer_referrer(customer_id);

-- 2. Customers referred by a customer-referrer
CREATE TABLE IF NOT EXISTS customer_referrer_referrals (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  refer_code             TEXT NOT NULL,
  affiliate_customer_id  TEXT NOT NULL,        -- Referrer's Medusa customer_id
  referred_customer_id   TEXT NOT NULL,        -- Referred customer's Medusa customer_id
  referred_email         TEXT,
  referred_name          TEXT,
  total_orders           INTEGER DEFAULT 0,
  total_order_value      NUMERIC(12,2) DEFAULT 0,
  coins_earned           NUMERIC(12,2) DEFAULT 0,
  first_order_at         TIMESTAMP,
  referred_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE(refer_code, referred_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_cust_ref_refs_code ON customer_referrer_referrals(refer_code);
CREATE INDEX IF NOT EXISTS idx_cust_ref_refs_aff_id ON customer_referrer_referrals(affiliate_customer_id);

-- 3. Coin ledger (audit trail for earned/pending coins)
CREATE TABLE IF NOT EXISTS customer_referrer_coins_log (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  affiliate_customer_id  TEXT NOT NULL,
  refer_code             TEXT NOT NULL,
  referred_customer_id   TEXT,
  order_id               TEXT,
  product_id             TEXT,                    -- Medusa product id (for one-use-per-product enforcement)
  coins                  NUMERIC(12,2) NOT NULL,
  status                 TEXT DEFAULT 'PENDING',  -- PENDING | EARNED | CANCELLED | REVERSED
  reason                 TEXT,
  created_at             TIMESTAMP DEFAULT NOW(),
  unlocked_at            TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cust_ref_coins_aff_id ON customer_referrer_coins_log(affiliate_customer_id);
CREATE INDEX IF NOT EXISTS idx_cust_ref_coins_status ON customer_referrer_coins_log(status);

-- Enforces "one-time use per (customer, refer_code, product)" lookup.
-- Only PENDING/EARNED entries count — CANCELLED/REVERSED free the slot.
CREATE INDEX IF NOT EXISTS idx_customer_referrer_coins_log_used_per_product
  ON customer_referrer_coins_log (referred_customer_id, refer_code, product_id)
  WHERE status IN ('PENDING', 'EARNED');

SELECT 'customer_referrer tables created successfully!' AS status;
