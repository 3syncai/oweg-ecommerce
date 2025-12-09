/**
 * Investigate Ghost Refund Display Issue
 * 
 * This script deeply inspects a specific order (e.g., #141) to find
 * the source of the "Refund - X" display in Medusa Admin Payments section.
 * 
 * We check:
 * 1. order_transaction table for refund-like records
 * 2. refund table for any entries
 * 3. payment table refunded_amount
 * 4. capture table entries
 * 5. All related payment module data
 * 
 * Run with: npx ts-node src/scripts/investigate-ghost-refund.ts
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

const TARGET_DISPLAY_ID = 141; // Change this to investigate a different order

async function investigate(): Promise<void> {
    log("\n=====================================================");
    log(`🔍 INVESTIGATING GHOST REFUND FOR ORDER #${TARGET_DISPLAY_ID}`);
    log("=====================================================\n");

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        // Step 1: Get the order
        log("📋 STEP 1: Finding order...\n");
        const orderRes = await pool.query(`
            SELECT id, display_id, currency_code, status, created_at
            FROM "order" WHERE display_id = $1
        `, [TARGET_DISPLAY_ID]);

        if (orderRes.rows.length === 0) {
            log(`❌ Order #${TARGET_DISPLAY_ID} not found!`);
            await pool.end();
            return;
        }

        const order = orderRes.rows[0];
        log(`✅ Found order: ${order.id}`);
        log(`   Display ID: ${order.display_id}`);
        log(`   Status: ${order.status}`);
        log(`   Currency: ${order.currency_code}`);

        // Step 2: Check order_transaction table
        log("\n\n📋 STEP 2: Checking order_transaction records...\n");
        const txRes = await pool.query(`
            SELECT id, amount, reference, reference_id, return_id, claim_id, exchange_id, created_at
            FROM order_transaction 
            WHERE order_id = $1
            ORDER BY created_at
        `, [order.id]);

        log(`Found ${txRes.rows.length} order_transaction records:`);
        let hasRefundTransaction = false;
        let hasNegativeAmount = false;
        
        txRes.rows.forEach((tx: any, i: number) => {
            const isNegative = Number(tx.amount) < 0;
            const isRefundRef = tx.reference?.toLowerCase() === 'refund';
            const hasReturnId = !!tx.return_id;
            
            if (isNegative) hasNegativeAmount = true;
            if (isRefundRef || hasReturnId) hasRefundTransaction = true;
            
            log(`\n  [${i + 1}] Transaction ID: ${tx.id}`);
            log(`      amount: ${tx.amount} ${isNegative ? '⚠️ NEGATIVE' : '✅'}`);
            log(`      reference: ${tx.reference || 'NULL'} ${isRefundRef ? '⚠️ REFUND REFERENCE' : ''}`);
            log(`      reference_id: ${tx.reference_id || 'NULL'}`);
            log(`      return_id: ${tx.return_id || 'NULL'} ${hasReturnId ? '⚠️ HAS RETURN' : ''}`);
            log(`      claim_id: ${tx.claim_id || 'NULL'}`);
            log(`      exchange_id: ${tx.exchange_id || 'NULL'}`);
            log(`      created_at: ${tx.created_at}`);
        });

        if (hasNegativeAmount) {
            log("\n  ⚠️ FOUND NEGATIVE AMOUNT TRANSACTIONS - This could cause 'Refund' display!");
        }
        if (hasRefundTransaction) {
            log("\n  ⚠️ FOUND REFUND-LIKE TRANSACTIONS - This could cause 'Refund' display!");
        }

        // Step 3: Get payment_collection and payment records
        log("\n\n📋 STEP 3: Checking payment_collection and payment records...\n");
        const paymentRes = await pool.query(`
            SELECT 
                pc.id as pc_id,
                pc.amount as pc_amount,
                pc.captured_amount,
                pc.refunded_amount,
                pc.status as pc_status,
                p.id as payment_id,
                p.amount as payment_amount,
                p.provider_id,
                p.data as payment_data,
                p.captured_at
            FROM payment_collection pc
            JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
            LEFT JOIN payment p ON p.payment_collection_id = pc.id
            WHERE opc.order_id = $1
        `, [order.id]);

        log(`Found ${paymentRes.rows.length} payment records:`);
        paymentRes.rows.forEach((p: any, i: number) => {
            const hasRefundedAmount = Number(p.refunded_amount) > 0;
            
            log(`\n  [${i + 1}] Payment Collection: ${p.pc_id}`);
            log(`      pc_amount: ${p.pc_amount}`);
            log(`      captured_amount: ${p.captured_amount}`);
            log(`      refunded_amount: ${p.refunded_amount || 0} ${hasRefundedAmount ? '⚠️ HAS REFUNDED AMOUNT' : '✅'}`);
            log(`      pc_status: ${p.pc_status}`);
            log(`      ---`);
            log(`      Payment ID: ${p.payment_id}`);
            log(`      payment_amount: ${p.payment_amount}`);
            log(`      provider_id: ${p.provider_id}`);
            log(`      captured_at: ${p.captured_at}`);
            
            if (hasRefundedAmount) {
                log("\n  ⚠️ PAYMENT COLLECTION HAS refunded_amount > 0 - This could cause 'Refund' display!");
            }
        });

        // Step 4: Check refund table for this payment
        log("\n\n📋 STEP 4: Checking refund table for linked refunds...\n");
        const refundRes = await pool.query(`
            SELECT r.*, p.id as payment_id
            FROM refund r
            JOIN payment p ON p.id = r.payment_id
            JOIN order_payment_collection opc ON opc.payment_collection_id = p.payment_collection_id
            WHERE opc.order_id = $1
        `, [order.id]);

        log(`Found ${refundRes.rows.length} refund records:`);
        if (refundRes.rows.length === 0) {
            log("  ✅ No refund records found for this order's payments");
        } else {
            refundRes.rows.forEach((r: any, i: number) => {
                log(`\n  [${i + 1}] Refund ID: ${r.id}`);
                log(`      amount: ${r.amount} ⚠️`);
                log(`      payment_id: ${r.payment_id}`);
                log(`      refund_reason_id: ${r.refund_reason_id || 'NULL'}`);
                log(`      note: ${r.note || 'NULL'}`);
                log(`      created_at: ${r.created_at}`);
            });
            log("\n  ⚠️ REFUND RECORDS EXIST - This is likely causing 'Refund' display!");
        }

        // Step 5: Check capture table
        log("\n\n📋 STEP 5: Checking capture table...\n");
        const captureRes = await pool.query(`
            SELECT c.*
            FROM capture c
            JOIN payment p ON p.id = c.payment_id
            JOIN order_payment_collection opc ON opc.payment_collection_id = p.payment_collection_id
            WHERE opc.order_id = $1
        `, [order.id]);

        log(`Found ${captureRes.rows.length} capture records:`);
        captureRes.rows.forEach((c: any, i: number) => {
            log(`\n  [${i + 1}] Capture ID: ${c.id}`);
            log(`      amount: ${c.amount}`);
            log(`      payment_id: ${c.payment_id}`);
            log(`      created_at: ${c.created_at}`);
        });

        // Step 6: Check order_summary
        log("\n\n📋 STEP 6: Checking order_summary...\n");
        const summaryRes = await pool.query(`
            SELECT totals FROM order_summary WHERE order_id = $1
        `, [order.id]);

        if (summaryRes.rows.length > 0) {
            const totals = summaryRes.rows[0].totals;
            log(`  paid_total: ${totals.paid_total}`);
            log(`  refunded_total: ${totals.refunded_total}`);
            log(`  transaction_total: ${totals.transaction_total}`);
            log(`  current_order_total: ${totals.current_order_total}`);
            log(`  pending_difference: ${totals.pending_difference}`);
            
            if (Number(totals.refunded_total) > 0) {
                log("\n  ⚠️ order_summary.refunded_total > 0 - This could affect display!");
            }
        }

        // DIAGNOSIS SUMMARY
        log("\n\n=====================================================");
        log("📊 DIAGNOSIS SUMMARY");
        log("=====================================================\n");

        const issues: string[] = [];
        
        if (hasNegativeAmount) {
            issues.push("- Negative amount in order_transaction");
        }
        if (hasRefundTransaction) {
            issues.push("- Refund-like order_transaction (reference='refund' or return_id set)");
        }
        if (paymentRes.rows.some((p: any) => Number(p.refunded_amount) > 0)) {
            issues.push("- payment_collection.refunded_amount > 0");
        }
        if (refundRes.rows.length > 0) {
            issues.push("- Entries in refund table linked to this order's payment");
        }

        if (issues.length === 0) {
            log("✅ No obvious ghost refund sources found in the inspected tables.");
            log("   The issue might be in Medusa Admin UI caching or other tables.");
        } else {
            log("⚠️ POTENTIAL GHOST REFUND SOURCES FOUND:");
            issues.forEach(issue => log(`   ${issue}`));
        }

    } catch (error: any) {
        log("❌ Error: " + error.message);
        console.error(error);
    } finally {
        await pool.end();
        fs.writeFileSync('./ghost_refund_investigation.txt', lines.join('\n'));
        log('\n📝 Full output written to: ./ghost_refund_investigation.txt');
    }
}

investigate();
