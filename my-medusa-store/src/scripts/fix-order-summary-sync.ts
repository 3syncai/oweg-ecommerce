/**
 * Fix Order Summary Sync Script
 * 
 * This script fixes orders where:
 * 1. order_summary.transaction_total doesn't match actual order_transaction sum
 * 2. Orders have captured payments but no order_transaction records
 * 3. Orders have order_transaction records but order_summary shows paid_total = 0
 * 
 * This fixes the "Refund" display issue in Medusa Admin by ensuring
 * order_summary.totals correctly reflects the payment state.
 * 
 * Run with: npx ts-node src/scripts/fix-order-summary-sync.ts
 * 
 * The script is IDEMPOTENT and safe to run multiple times.
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

async function fixOrderSummarySync(): Promise<void> {
    log("\n==============================================");
    log("🔧 FIX ORDER SUMMARY SYNC");
    log("==============================================");
    log("This script ensures order_summary.totals matches order_transaction records\n");

    if (!process.env.DATABASE_URL) {
        log('❌ DATABASE_URL not set!');
        return;
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    // Stats
    let ordersAnalyzed = 0;
    let transactionsCreated = 0;
    let summariesFixed = 0;
    let alreadyCorrect = 0;
    let errors = 0;

    try {
        // Step 1: Find all orders with captured payments
        log("📋 Step 1: Finding all orders with payment data...\n");
        
        const ordersQuery = `
            SELECT
                o.id as order_id,
                o.display_id,
                o.currency_code,
                o.created_at,
                os.id as summary_id,
                os.totals,
                (os.totals->>'paid_total')::numeric as paid_total,
                (os.totals->>'transaction_total')::numeric as transaction_total,
                (os.totals->>'current_order_total')::numeric as order_total
            FROM "order" o
            INNER JOIN order_summary os ON os.order_id = o.id
            ORDER BY o.created_at DESC
            LIMIT 200
        `;
        
        const ordersRes = await pool.query(ordersQuery);
        log(`   Found ${ordersRes.rows.length} orders to analyze\n`);

        // Step 2: Process each order
        for (const order of ordersRes.rows) {
            ordersAnalyzed++;
            const displayId = order.display_id;
            
            try {
                // Get captured payments for this order
                const paymentsQuery = `
                    SELECT p.id, p.amount, p.data, p.currency_code, p.captured_at
                    FROM payment p
                    INNER JOIN order_payment_collection opc 
                        ON opc.payment_collection_id = p.payment_collection_id
                    WHERE opc.order_id = $1
                      AND p.captured_at IS NOT NULL
                `;
                const paymentsRes = await pool.query(paymentsQuery, [order.order_id]);

                // Get existing transactions
                const txQuery = `
                    SELECT id, amount, reference 
                    FROM order_transaction 
                    WHERE order_id = $1 AND deleted_at IS NULL
                `;
                const txRes = await pool.query(txQuery, [order.order_id]);
                const existingTxSum = txRes.rows.reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
                const existingTxCount = txRes.rows.length;

                // Calculate expected payment total
                const capturedPaymentTotal = paymentsRes.rows.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

                // Skip if no captured payments
                if (paymentsRes.rows.length === 0) {
                    continue;
                }

                // Check if transactions need to be created
                if (existingTxCount === 0 && capturedPaymentTotal > 0) {
                    log(`\n--- Order #${displayId} ---`);
                    log(`   Has ${paymentsRes.rows.length} captured payment(s) worth ₹${capturedPaymentTotal}`);
                    log(`   But NO order_transaction records`);
                    
                    // Create missing transactions
                    for (const payment of paymentsRes.rows) {
                        const amount = Number(payment.amount);
                        const rawAmount = JSON.stringify({ value: String(amount), precision: 20 });
                        const currencyCode = payment.currency_code || order.currency_code || 'inr';
                        const razorpayPaymentId = payment.data?.razorpay_payment_id || payment.id;
                        const razorpayOrderId = payment.data?.razorpay_order_id || payment.id;

                        // Check if this exact transaction already exists (by reference)
                        const existsTx = await pool.query(`
                            SELECT id FROM order_transaction 
                            WHERE order_id = $1 AND reference = $2
                        `, [order.order_id, razorpayPaymentId]);

                        if (existsTx.rows.length === 0) {
                            await pool.query(`
                                INSERT INTO order_transaction (
                                    id, order_id, version, amount, raw_amount, currency_code,
                                    reference, reference_id, created_at, updated_at
                                ) VALUES (
                                    gen_random_uuid(), $1, 1, $2, $3, $4, $5, $6, now(), now()
                                )
                            `, [order.order_id, amount, rawAmount, currencyCode.toLowerCase(), razorpayPaymentId, razorpayOrderId]);

                            log(`   ✅ Created order_transaction for payment ${payment.id} (₹${amount})`);
                            transactionsCreated++;
                        }
                    }
                }

                // Recalculate actual transaction sum after potential creations
                const txSumRes = await pool.query(`
                    SELECT COALESCE(SUM(amount), 0) as total 
                    FROM order_transaction 
                    WHERE order_id = $1 AND deleted_at IS NULL
                `, [order.order_id]);
                const actualTxTotal = Number(txSumRes.rows[0].total);

                // Check if order_summary needs update
                const currentPaidTotal = Number(order.paid_total) || 0;
                const currentTxTotal = Number(order.transaction_total) || 0;
                const orderTotal = Number(order.order_total) || 0;

                // Determine if summary needs updating
                const paidMismatch = Math.abs(currentPaidTotal - actualTxTotal) > 0.01;
                const txMismatch = Math.abs(currentTxTotal - actualTxTotal) > 0.01;

                if (paidMismatch || txMismatch) {
                    if (transactionsCreated === 0) {
                        log(`\n--- Order #${displayId} ---`);
                    }
                    log(`   Summary mismatch: paid_total=${currentPaidTotal}, tx_total=${currentTxTotal}, actual=${actualTxTotal}`);

                    // Update order_summary.totals
                    const pendingDifference = Math.max(0, orderTotal - actualTxTotal);
                    const updatedTotals = {
                        ...(order.totals || {}),
                        paid_total: actualTxTotal,
                        raw_paid_total: { value: String(actualTxTotal), precision: 20 },
                        transaction_total: actualTxTotal,
                        raw_transaction_total: { value: String(actualTxTotal), precision: 20 },
                        pending_difference: pendingDifference,
                        raw_pending_difference: { value: String(pendingDifference), precision: 20 },
                    };

                    await pool.query(`
                        UPDATE order_summary 
                        SET totals = $1, updated_at = now()
                        WHERE order_id = $2
                    `, [JSON.stringify(updatedTotals), order.order_id]);

                    log(`   ✅ Updated order_summary: paid_total = ₹${actualTxTotal}`);
                    summariesFixed++;
                } else if (existingTxCount > 0) {
                    alreadyCorrect++;
                }

            } catch (orderError: any) {
                log(`\n--- Order #${displayId} ---`);
                log(`   ❌ Error: ${orderError.message}`);
                errors++;
            }
        }

        // Summary
        log("\n\n==============================================");
        log("📊 FIX ORDER SUMMARY SYNC - COMPLETE");
        log("==============================================");
        log(`   Orders analyzed:       ${ordersAnalyzed}`);
        log(`   Transactions created:  ${transactionsCreated}`);
        log(`   Summaries fixed:       ${summariesFixed}`);
        log(`   Already correct:       ${alreadyCorrect}`);
        log(`   Errors:                ${errors}`);
        log("==============================================\n");

        if (transactionsCreated > 0 || summariesFixed > 0) {
            log("✅ Fixes applied! Refresh Medusa Admin to verify.");
            log("   Orders should now show correct paid amounts instead of 'Refund' display.");
        } else if (alreadyCorrect > 0) {
            log("✅ All orders with payments are already correctly synced!");
        } else {
            log("ℹ️ No orders needed fixing.");
        }

    } catch (error: any) {
        log("❌ Script failed: " + error.message);
        console.error(error);
    } finally {
        await pool.end();
        fs.writeFileSync('./fix_order_summary_output.txt', lines.join('\n'));
        log('\n📝 Output written to: ./fix_order_summary_output.txt');
    }
}

fixOrderSummarySync();
