-- Fix Affiliate Wallet for vg2556519@gmail.com
-- Customer ID: cus_01KAGZ14VW2Q09AXHGDQ2XAC1M

-- Step 1: Create affiliate_user record
INSERT INTO affiliate_user (id, email, refer_code, created_at, updated_at)
VALUES ('cus_01KAGZ14VW2Q09AXHGDQ2XAC1M', 'vg2556519@gmail.com', '0WEGVISHAL94014', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET refer_code = '0WEGVISHAL94014';

-- Step 2: Update ALL commission logs to link to this user
UPDATE affiliate_commission_log
SET affiliate_user_id = 'cus_01KAGZ14VW2Q09AXHGDQ2XAC1M'
WHERE affiliate_code = '0WEGVISHAL94014' AND affiliate_user_id IS NULL;

-- Step 3: Create wallet if doesn't exist
INSERT INTO customer_wallet (customer_id, coins_balance, created_at, updated_at)
VALUES ('cus_01KAGZ14VW2Q09AXHGDQ2XAC1M', 0, NOW(), NOW())
ON CONFLICT (customer_id) DO NOTHING;

-- Step 4: Credit the commission amount
-- Get total pending/credited commission that wasn't paid
WITH total_commission AS (
    SELECT COALESCE(SUM(commission_amount), 0) as total
    FROM affiliate_commission_log
    WHERE affiliate_code = '0WEGVISHAL94014'
      AND status IN ('PENDING', 'CREDITED')
)
UPDATE customer_wallet
SET coins_balance = coins_balance + (SELECT total FROM total_commission),
    updated_at = NOW()
WHERE customer_id = 'cus_01KAGZ14VW2Q09AXHGDQ2XAC1M';

-- Step 5: Verify the fix
SELECT 
    au.refer_code,
    au.email,
    cw.coins_balance / 100.0 as balance_rupees,
    cw.coins_balance as balance_paise
FROM affiliate_user au
JOIN customer_wallet cw ON au.id = cw.customer_id
WHERE au.refer_code = '0WEGVISHAL94014';
