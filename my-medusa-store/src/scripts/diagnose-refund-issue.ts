/**
 * Diagnose the "Refund" display issue in Medusa Admin
 * This script checks order_transaction and order_summary data
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

async function diagnose(): Promise<void> {
    log("\n==========================================");
    log("🔍 DIAGNOSING REFUND DISPLAY ISSUE");
    log("==========================================\n");

    if (!process.env.DATABASE_URL) {
        log('❌ DATABASE_URL not set!');
        return;
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        // 1. Check order_transaction schema
        log("📋 Step 1: Checking order_transaction schema...\n");
        const schemaRes = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'order_transaction'
            ORDER BY ordinal_position
        `);
        schemaRes.rows.forEach(r => log(`  ${r.column_name}: ${r.data_type}`));

        // 2. Check ALL order_transaction entries
        log("\n📋 Step 2: ALL order_transaction entries...\n");
        const txRes = await pool.query(`
            SELECT ot.*, o.display_id
            FROM order_transaction ot 
            JOIN "order" o ON o.id = ot.order_id
            ORDER BY ot.created_at DESC 
            LIMIT 30
        `);
        
        log(`Found ${txRes.rows.length} order_transaction entries`);
        if (txRes.rows.length === 0) {
            log("  ⚠️ No order_transaction entries found - this means transactions aren't being created");
        } else {
            txRes.rows.forEach(r => {
                log(`\n  Order #${r.display_id}:`);
                log(`    id: ${r.id}`);
                log(`    amount: ${r.amount}`);
                log(`    reference: ${r.reference || 'NULL'}`);
                log(`    reference_id: ${r.reference_id || 'NULL'}`);
                log(`    return_id: ${r.return_id || 'NULL'}`);
                log(`    claim_id: ${r.claim_id || 'NULL'}`);
                log(`    exchange_id: ${r.exchange_id || 'NULL'}`);
            });
        }

        // 3. Check order_summary for orders with concerning data
        log("\n\n📋 Step 3: Order Summary data for recent orders...\n");
        const summaryRes = await pool.query(`
            SELECT 
                o.display_id,
                os.totals->>'paid_total' as paid_total,
                os.totals->>'refunded_total' as refunded_total,
                os.totals->>'transaction_total' as transaction_total,
                os.totals->>'current_order_total' as order_total,
                os.totals->>'pending_difference' as pending
            FROM order_summary os
            JOIN "order" o ON o.id = os.order_id
            ORDER BY o.created_at DESC
            LIMIT 15
        `);
        
        summaryRes.rows.forEach(r => {
            log(`  Order #${r.display_id}: paid=${r.paid_total}, refunded=${r.refunded_total}, tx=${r.transaction_total}, total=${r.order_total}, pending=${r.pending}`);
        });

        // 4. Check for any references that might be "refund"
        log("\n\n📋 Step 4: Searching for 'refund' reference in transactions...\n");
        const refundRefRes = await pool.query(`
            SELECT * FROM order_transaction WHERE reference ILIKE '%refund%'
        `);
        if (refundRefRes.rows.length === 0) {
            log("  ✅ No transactions with 'refund' in reference field");
        } else {
            log(`  ⚠️ Found ${refundRefRes.rows.length} transactions with 'refund' reference`);
            refundRefRes.rows.forEach(r => log(`    - ${JSON.stringify(r)}`));
        }

        // 5. Check for transactions with return_id set
        log("\n📋 Step 5: Searching for transactions with return_id set...\n");
        const returnIdRes = await pool.query(`
            SELECT ot.*, o.display_id
            FROM order_transaction ot
            JOIN "order" o ON o.id = ot.order_id
            WHERE ot.return_id IS NOT NULL
        `);
        if (returnIdRes.rows.length === 0) {
            log("  ✅ No transactions with return_id set");
        } else {
            log(`  ⚠️ Found ${returnIdRes.rows.length} transactions with return_id set`);
            returnIdRes.rows.forEach(r => {
                log(`    Order #${r.display_id}: amount=${r.amount}, return_id=${r.return_id}`);
            });
        }

        // 6. Check for negative amounts
        log("\n📋 Step 6: Searching for transactions with negative amounts...\n");
        const negativeRes = await pool.query(`
            SELECT ot.*, o.display_id
            FROM order_transaction ot
            JOIN "order" o ON o.id = ot.order_id
            WHERE ot.amount < 0
        `);
        if (negativeRes.rows.length === 0) {
            log("  ✅ No transactions with negative amounts");
        } else {
            log(`  ⚠️ Found ${negativeRes.rows.length} transactions with negative amounts`);
            negativeRes.rows.forEach(r => {
                log(`    Order #${r.display_id}: amount=${r.amount}`);
            });
        }

        // 7. Check for refund-related tables
        log("\n\n📋 Step 7: Checking refund-related tables...\n");
        const refundTables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name IN ('refund', 'payment_refund', 'order_refund', 'refund_reason', 'capture')
        `);
        log(`  Found tables: ${refundTables.rows.map((r: any) => r.table_name).join(', ') || 'none'}`);
        
        // Check the refund table if it exists
        try {
            const refundData = await pool.query('SELECT * FROM refund LIMIT 10');
            log(`\n  Refund table entries: ${refundData.rows.length}`);
            refundData.rows.forEach((r: any) => log(`    - ${JSON.stringify(r)}`));
        } catch (e) {
            log(`  Refund table not accessible`);
        }
        
        // Check capture table if exists
        try {
            const captureData = await pool.query('SELECT * FROM capture LIMIT 10');
            log(`\n  Capture table entries: ${captureData.rows.length}`);
            captureData.rows.forEach((r: any) => log(`    - ${JSON.stringify(r)}`));
        } catch (e) {
            log(`  Capture table not accessible`);
        }

        // 8. Check payment_collection.refunded_amount for any orders
        log("\n\n📋 Step 8: Payment collection captured/refunded amounts...\n");
        const pcAmounts = await pool.query(`
            SELECT 
                o.display_id,
                pc.amount,
                pc.captured_amount,
                pc.refunded_amount,
                pc.status
            FROM payment_collection pc
            JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
            JOIN "order" o ON o.id = opc.order_id
            ORDER BY pc.created_at DESC
            LIMIT 10
        `);
        pcAmounts.rows.forEach((r: any) => {
            log(`  Order #${r.display_id}: amount=${r.amount}, captured=${r.captured_amount}, refunded=${r.refunded_amount}, status=${r.status}`);
        });

    } catch (error: any) {
        log("❌ Error: " + error.message);
    } finally {
        await pool.end();
        fs.writeFileSync('./diagnose_refund_output.txt', lines.join('\n'));
        log('\n✅ Output written to: ./diagnose_refund_output.txt');
    }
}

diagnose();
