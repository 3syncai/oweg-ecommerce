-- Fix 1: Manually credit the wallet
UPDATE customer_wallet
SET coins_balance = coins_balance + 26.44,
    updated_at = NOW()
WHERE customer_id = '01KBJV4DD5NM39SDADXSH9WTY4';

-- Fix 2: Verify the balance
SELECT 
    customer_id,
    coins_balance as wallet_balance_rupees,
    updated_at
FROM customer_wallet 
WHERE customer_id = '01KBJV4DD5NM39SDADXSH9WTY4';
