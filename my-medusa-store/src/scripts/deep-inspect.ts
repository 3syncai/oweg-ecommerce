/**
 * Deep inspection of order transactions and captures
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const lines: string[] = [];
function log(msg: string) {
    console.log(msg);
    lines.push(msg);
}

async function inspect(): Promise<void> {
    log("\n========================================");
    log("🔍 DEEP INSPECTION - TRANSACTIONS & CAPTURES");
    log("========================================\n");

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        // Check all transactions with full data
        log("📋 ALL order_transaction entries with FULL data:\n");
        const txRes = await pool.query(`
            SELECT ot.*, o.display_id
            FROM order_transaction ot
            JOIN "order" o ON o.id = ot.order_id
            ORDER BY ot.created_at DESC
            LIMIT 20
        `);
        
        txRes.rows.forEach((r: any) => {
            log(`Order #${r.display_id}:`);
            log(`  Full record: ${JSON.stringify(r)}`);
            log('');
        });
        
        // Check capture entries
        log("\n📋 Capture entries with payment data:\n");
        const captureRes = await pool.query(`
            SELECT c.*, p.data as payment_data
            FROM capture c
            JOIN payment p ON p.id = c.payment_id
            LIMIT 10
        `);
        
        captureRes.rows.forEach((r: any) => {
            log(`Capture ID: ${r.id}`);
            log(`  Amount: ${r.amount}`);
            log(`  Payment Data: ${JSON.stringify(r.payment_data)}`);
            log('');
        });
        
        // Check the relationship between order_summary transaction_total and what admin sees
        log("\n📋 Order summary vs order_transaction comparison:\n");
        const comparisonRes = await pool.query(`
            SELECT 
                o.display_id,
                os.totals->>'transaction_total' as summary_tx_total,
                COALESCE(SUM(ot.amount), 0) as actual_tx_sum,
                COUNT(ot.id) as tx_count
            FROM "order" o
            JOIN order_summary os ON os.order_id = o.id
            LEFT JOIN order_transaction ot ON ot.order_id = o.id
            GROUP BY o.display_id, os.totals->>'transaction_total', o.created_at
            ORDER BY o.created_at DESC
            LIMIT 10
        `);
        
        comparisonRes.rows.forEach((r: any) => {
            const match = parseFloat(r.summary_tx_total) === parseFloat(r.actual_tx_sum);
            log(`Order #${r.display_id}: summary_tx=${r.summary_tx_total}, actual_tx_sum=${r.actual_tx_sum}, tx_count=${r.tx_count} ${match ? '✅' : '⚠️ MISMATCH'}`);
        });

    } catch (error: any) {
        log("❌ Error: " + error.message);
    } finally {
        await pool.end();
        fs.writeFileSync('./deep_inspection_output.txt', lines.join('\n'));
        log('\n✅ Output written to: ./deep_inspection_output.txt');
    }
}

inspect();
