import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const lines: string[] = [];
function log(msg: string) {
    console.log(msg);
    lines.push(msg);
}

async function fixWithDebug() {
    log("\n=== FIX ORDER #129 WITH DEBUG ===\n");

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        // Check order_transaction table schema
        log("Step 1: Checking order_transaction table schema...");
        const schemaRes = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'order_transaction'
            ORDER BY ordinal_position
        `);
        
        log("Columns:");
        schemaRes.rows.forEach(col => {
            log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });

        // Order #129 details
        const orderId = 'order_01KC069SE71GZ3714NQE741AZX';
        const paymentId = '17dd6854-4a87-40a6-9402-0d2471943434';
        const amount = 891.06;
        const currencyCode = 'inr';
        const razorpayPaymentId = 'pay_RpJ3LIto7wVKsc';

        // Check if transaction already exists
        log("\nStep 2: Checking for existing transactions...");
        const checkRes = await pool.query(`SELECT id FROM order_transaction WHERE order_id = '${orderId}'`);
        log(`  Found: ${checkRes.rows.length} existing transactions`);

        if (checkRes.rows.length > 0) {
            log("  Transaction already exists!");
            await pool.end();
            fs.writeFileSync('./fix_debug_output.txt', lines.join('\n'));
            return;
        }

        // Build raw_amount JSON
        const rawAmount = JSON.stringify({ value: String(amount), precision: 20 });
        const metadata = JSON.stringify({ provider: 'razorpay', razorpay_payment_id: razorpayPaymentId });

        log("\nStep 3: Attempting INSERT...");
        log("  order_id: " + orderId);
        log("  amount: " + amount);

        try {
            const result = await pool.query(`
                INSERT INTO order_transaction (
                    id, order_id, amount, raw_amount, currency_code,
                    reference, reference_id, metadata,
                    created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), '${orderId}', ${amount}, '${rawAmount}', '${currencyCode}',
                    '${paymentId}', '${razorpayPaymentId}', '${metadata}', now(), now()
                )
                RETURNING id, order_id, amount;
            `);

            log("\n✅ SUCCESS!");
            log("  Transaction ID: " + result.rows[0].id);
            log("  Amount: " + result.rows[0].amount);

        } catch (insertError: any) {
            log("\n❌ INSERT FAILED!");
            log("  Error Code: " + insertError.code);
            log("  Error Message: " + insertError.message);
            log("  Detail: " + insertError.detail);
        }

    } catch (error: any) {
        log("Error: " + error.message);
    } finally {
        await pool.end();
        fs.writeFileSync('./fix_debug_output.txt', lines.join('\n'));
        log("\nOutput written to fix_debug_output.txt");
    }
}

fixWithDebug();
