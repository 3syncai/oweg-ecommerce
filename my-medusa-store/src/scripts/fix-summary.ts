import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const lines: string[] = [];
function log(msg: string) {
    console.log(msg);
    lines.push(msg);
}

async function analyzeAndFix() {
    log("\n=== ANALYZE ORDER SUMMARY ===\n");

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    const orderId = 'order_01KC069SE71GZ3714NQE741AZX';

    try {
        // Check current transaction total
        log("Step 1: Check order_transaction sum...");
        const txSumRes = await pool.query(`
            SELECT SUM(amount) as tx_total 
            FROM order_transaction 
            WHERE order_id = $1
        `, [orderId]);
        log(`  Transaction Total: ${txSumRes.rows[0].tx_total}`);

        // Check current order_summary
        log("\nStep 2: Check order_summary totals...");
        const summaryRes = await pool.query(`
            SELECT id, totals
            FROM order_summary 
            WHERE order_id = $1
        `, [orderId]);
        
        if (summaryRes.rows.length > 0) {
            const totals = summaryRes.rows[0].totals;
            log(`  paid_total: ${totals.paid_total}`);
            log(`  transaction_total: ${totals.transaction_total}`);
            log(`  current_order_total: ${totals.current_order_total}`);
            log(`  pending_difference: ${totals.pending_difference}`);

            // Step 3: Update the totals with correct values
            const txTotal = Number(txSumRes.rows[0].tx_total) || 0;
            const orderTotal = Number(totals.current_order_total);
            
            log("\nStep 3: Updating order_summary totals...");
            log(`  Setting paid_total = ${txTotal}`);
            log(`  Setting transaction_total = ${txTotal}`);
            log(`  Setting pending_difference = ${orderTotal - txTotal}`);

            // Update the totals JSONB
            const updatedTotals = {
                ...totals,
                paid_total: txTotal,
                raw_paid_total: { value: String(txTotal), precision: 20 },
                transaction_total: txTotal,
                raw_transaction_total: { value: String(txTotal), precision: 20 },
                pending_difference: orderTotal - txTotal,
                raw_pending_difference: { value: String(orderTotal - txTotal), precision: 20 },
            };

            await pool.query(`
                UPDATE order_summary 
                SET totals = $1, updated_at = now()
                WHERE order_id = $2
            `, [JSON.stringify(updatedTotals), orderId]);

            log("\n✅ Order summary totals updated!");
            log("   Refresh Medusa Admin to verify the 'Refund' bar is gone.");
        }

    } catch (error: any) {
        log("❌ Error: " + error.message);
    } finally {
        await pool.end();
        fs.writeFileSync('./analyze_output.txt', lines.join('\n'));
    }
}

analyzeAndFix();
