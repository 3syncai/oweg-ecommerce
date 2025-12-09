/**
 * Find ghost refund sources across all orders
 * 
 * This script scans for:
 * 1. Refund table entries linked to orders
 * 2. Payment collections with refunded_amount > 0
 * 3. Order transactions with negative amounts or refund reference
 * 
 * Run with: npx ts-node src/scripts/find-ghost-refunds.ts
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

async function findGhostRefunds(): Promise<void> {
    log("\n=====================================================");
    log("🔍 FINDING ALL GHOST REFUND SOURCES");
    log("=====================================================\n");

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        // 1. Check refund table entries linked to orders
        log("📋 STEP 1: Checking refund table entries linked to orders...\n");
        const refundRes = await pool.query(`
            SELECT r.id as refund_id, r.amount as refund_amount, r.payment_id, 
                   r.created_at as refund_created,
                   p.amount as payment_amount, p.id as payment_id,
                   o.display_id as order_display_id, o.id as order_id
            FROM refund r
            JOIN payment p ON p.id = r.payment_id
            JOIN order_payment_collection opc ON opc.payment_collection_id = p.payment_collection_id
            JOIN "order" o ON o.id = opc.order_id
            ORDER BY r.created_at DESC
            LIMIT 50
        `);
        
        log(`Found ${refundRes.rows.length} refund table entries linked to orders:`);
        if (refundRes.rows.length === 0) {
            log("  ✅ No refund records in database");
        } else {
            refundRes.rows.forEach((r: any, i: number) => {
                log(`\n  [${i + 1}] Order #${r.order_display_id}:`);
                log(`      refund_id: ${r.refund_id}`);
                log(`      refund_amount: ${r.refund_amount} ⚠️`);
                log(`      payment_id: ${r.payment_id}`);
                log(`      refund_created: ${r.refund_created}`);
            });
        }

        // 2. Check payment collections with refunded_amount > 0
        log("\n\n📋 STEP 2: Checking payment_collection with refunded_amount > 0...\n");
        const pcRefundRes = await pool.query(`
            SELECT pc.id as pc_id, pc.refunded_amount, pc.captured_amount, pc.amount,
                   o.display_id as order_display_id, o.id as order_id
            FROM payment_collection pc
            JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
            JOIN "order" o ON o.id = opc.order_id
            WHERE pc.refunded_amount IS NOT NULL AND pc.refunded_amount::numeric > 0
            ORDER BY pc.updated_at DESC
            LIMIT 50
        `);
        
        log(`Found ${pcRefundRes.rows.length} payment collections with refunded_amount > 0:`);
        if (pcRefundRes.rows.length === 0) {
            log("  ✅ No payment collections with refunded_amount > 0");
        } else {
            pcRefundRes.rows.forEach((r: any, i: number) => {
                log(`\n  [${i + 1}] Order #${r.order_display_id}:`);
                log(`      pc_id: ${r.pc_id}`);
                log(`      refunded_amount: ${r.refunded_amount} ⚠️`);
                log(`      captured_amount: ${r.captured_amount}`);
                log(`      amount: ${r.amount}`);
            });
        }

        // 3. Check order transactions with negative amounts
        log("\n\n📋 STEP 3: Checking order_transaction with negative amounts...\n");
        const negativeRes = await pool.query(`
            SELECT ot.id, ot.amount, ot.reference, ot.reference_id, ot.return_id,
                   o.display_id as order_display_id
            FROM order_transaction ot
            JOIN "order" o ON o.id = ot.order_id
            WHERE ot.amount::numeric < 0
            ORDER BY ot.created_at DESC
            LIMIT 50
        `);
        
        log(`Found ${negativeRes.rows.length} order_transaction with negative amounts:`);
        if (negativeRes.rows.length === 0) {
            log("  ✅ No transactions with negative amounts");
        } else {
            negativeRes.rows.forEach((r: any, i: number) => {
                log(`\n  [${i + 1}] Order #${r.order_display_id}:`);
                log(`      tx_id: ${r.id}`);
                log(`      amount: ${r.amount} ⚠️ NEGATIVE`);
                log(`      reference: ${r.reference}`);
                log(`      return_id: ${r.return_id}`);
            });
        }

        // 4. Check order transactions with 'refund' reference
        log("\n\n📋 STEP 4: Checking order_transaction with 'refund' reference...\n");
        const refRefRes = await pool.query(`
            SELECT ot.id, ot.amount, ot.reference, ot.reference_id, ot.return_id,
                   o.display_id as order_display_id
            FROM order_transaction ot
            JOIN "order" o ON o.id = ot.order_id
            WHERE LOWER(ot.reference) = 'refund'
            ORDER BY ot.created_at DESC
            LIMIT 50
        `);
        
        log(`Found ${refRefRes.rows.length} order_transaction with reference='refund':`);
        if (refRefRes.rows.length === 0) {
            log("  ✅ No transactions with 'refund' reference");
        } else {
            refRefRes.rows.forEach((r: any, i: number) => {
                log(`\n  [${i + 1}] Order #${r.order_display_id}:`);
                log(`      tx_id: ${r.id}`);
                log(`      amount: ${r.amount}`);
                log(`      reference: ${r.reference} ⚠️ REFUND REFERENCE`);
            });
        }

        // 5. Check order transactions with return_id set
        log("\n\n📋 STEP 5: Checking order_transaction with return_id set...\n");
        const returnIdRes = await pool.query(`
            SELECT ot.id, ot.amount, ot.reference, ot.return_id,
                   o.display_id as order_display_id
            FROM order_transaction ot
            JOIN "order" o ON o.id = ot.order_id
            WHERE ot.return_id IS NOT NULL
            ORDER BY ot.created_at DESC
            LIMIT 50
        `);
        
        log(`Found ${returnIdRes.rows.length} order_transaction with return_id set:`);
        if (returnIdRes.rows.length === 0) {
            log("  ✅ No transactions with return_id set");
        } else {
            returnIdRes.rows.forEach((r: any, i: number) => {
                log(`\n  [${i + 1}] Order #${r.order_display_id}:`);
                log(`      tx_id: ${r.id}`);
                log(`      amount: ${r.amount}`);
                log(`      return_id: ${r.return_id} ⚠️ HAS RETURN`);
            });
        }

        // 6. Check payment table for captured payments that might have refund data
        log("\n\n📋 STEP 6: Checking payment table for any refund-related columns...\n");
        const paymentSchemaRes = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'payment'
            AND column_name LIKE '%refund%'
        `);
        
        log(`Payment table columns with 'refund' in name:`);
        if (paymentSchemaRes.rows.length === 0) {
            log("  No columns with 'refund' in name");
        } else {
            paymentSchemaRes.rows.forEach((r: any) => {
                log(`  - ${r.column_name}: ${r.data_type}`);
            });
        }

        // SUMMARY
        log("\n\n=====================================================");
        log("📊 SUMMARY");
        log("=====================================================\n");

        const hasRefundTableEntries = refundRes.rows.length > 0;
        const hasRefundedAmount = pcRefundRes.rows.length > 0;
        const hasNegativeTx = negativeRes.rows.length > 0;
        const hasRefundRef = refRefRes.rows.length > 0;
        const hasReturnId = returnIdRes.rows.length > 0;

        if (!hasRefundTableEntries && !hasRefundedAmount && !hasNegativeTx && !hasRefundRef && !hasReturnId) {
            log("✅ No ghost refund sources found in the database!");
            log("   The 'Refund' display might be from Medusa Admin UI caching or frontend logic.");
        } else {
            log("⚠️ GHOST REFUND SOURCES FOUND:");
            if (hasRefundTableEntries) log(`   - ${refundRes.rows.length} entries in refund table`);
            if (hasRefundedAmount) log(`   - ${pcRefundRes.rows.length} payment_collections with refunded_amount > 0`);
            if (hasNegativeTx) log(`   - ${negativeRes.rows.length} order_transactions with negative amounts`);
            if (hasRefundRef) log(`   - ${refRefRes.rows.length} order_transactions with reference='refund'`);
            if (hasReturnId) log(`   - ${returnIdRes.rows.length} order_transactions with return_id set`);
        }

    } catch (error: any) {
        log("❌ Error: " + error.message);
        console.error(error);
    } finally {
        await pool.end();
        fs.writeFileSync('./find_ghost_refunds_output.txt', lines.join('\n'));
        log('\n📝 Full output written to: ./find_ghost_refunds_output.txt');
    }
}

findGhostRefunds();
