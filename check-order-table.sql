-- Check the order table structure to find payment-related columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'order' 
AND column_name LIKE '%payment%'
ORDER BY ordinal_position;

-- Also check all columns in order table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'order'
ORDER BY ordinal_position;
