import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const lines: string[] = [];
function log(msg: string) {
    console.log(msg);
    lines.push(msg);
}

async function fixOrder129() {
    log("\n=== FIX ORDER #129 ===\n");

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        // Order #129 details
        const orderId = 'order_01KC069SE71GZ3714NQE741AZX';
        const paymentId = '17dd6854-4a87-40a6-9402-0d2471943434';
        const amount = 891.06;
        const currencyCode = 'inr';
        const razorpayPaymentId = 'pay_RpJ3LIto7wVKsc';

        // Check if transaction already exists
        log("Checking for existing transactions...");
        const checkRes = await pool.query(`SELECT id FROM order_transaction WHERE order_id = '${orderId}'`);
        log(`  Found: ${checkRes.rows.length} existing transactions`);

        if (checkRes.rows.length > 0) {
            log("✅ Transaction already exists!");
            await pool.end();
            fs.writeFileSync('./fix_output.txt', lines.join('\n'));
            return;
        }

        // Build raw_amount JSON
        const rawAmount = JSON.stringify({ value: String(amount), precision: 20 });

        log("\nInserting OrderTransaction...");
        log("  order_id: " + orderId);
        log("  amount: ₹" + amount);

        // Fixed INSERT - no metadata column, version = 1
        const result = await pool.query(`
            INSERT INTO order_transaction (
                id, order_id, version, amount, raw_amount, currency_code,
                reference, reference_id, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), 
                '${orderId}', 
                1,
                ${amount}, 
                '${rawAmount}', 
                '${currencyCode}',
                '${paymentId}', 
                '${razorpayPaymentId}', 
                now(), 
                now()
            )
            RETURNING id, order_id, amount;
        `);

        log("\n✅ SUCCESS!");
        log("  Transaction ID: " + result.rows[0].id);
        log("  Order ID: " + result.rows[0].order_id);
        log("  Amount: ₹" + result.rows[0].amount);
        log("\n📌 Refresh Medusa Admin to see the updated paid_total.");
        log("   The 'Refund' bar should disappear for this order.");

    } catch (error: any) {
        log("❌ Error: " + error.message);
    } finally {
        await pool.end();
        fs.writeFileSync('./fix_output.txt', lines.join('\n'));
    }
}

fixOrder129();
