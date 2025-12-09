/**
 * COMPLETE Backfill Script for OrderTransaction + Order Summary
 * 
 * This script fixes orders where:
 * - paid_total = 0 in order_summary
 * - But payment is actually captured (in payment table)
 * 
 * It does TWO things:
 * 1. Creates missing OrderTransaction records
 * 2. Updates order_summary.totals with correct paid_total
 * 
 * Run with: npx ts-node src/scripts/backfill-order-transactions.ts
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

async function backfillOrderTransactions(): Promise<void> {
    log("\n===========================================");
    log("🔧 Starting OrderTransaction Backfill Script");
    log("===========================================\n");

    if (!process.env.DATABASE_URL) {
        log('❌ DATABASE_URL not set!');
        return;
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    // Stats
    let ordersFixed = 0;
    let transactionsCreated = 0;
    let summariesUpdated = 0;

    try {
        // Step 1: Find orders with paid_total = 0 but have captured payments
        log("📋 Step 1: Finding orders needing fix...\n");
        
        const ordersQuery = `
            SELECT 
                o.id as order_id,
                o.display_id,
                o.currency_code,
                os.id as summary_id,
                os.totals,
                (os.totals->>'paid_total')::numeric as paid_total,
                (os.totals->>'current_order_total')::numeric as order_total
            FROM "order" o
            INNER JOIN order_summary os ON os.order_id = o.id
            WHERE (os.totals->>'paid_total')::numeric = 0
              AND (os.totals->>'current_order_total')::numeric > 0
            ORDER BY o.created_at DESC
            LIMIT 100
        `;
        
        const ordersRes = await pool.query(ordersQuery);
        log(`   Found ${ordersRes.rows.length} orders with paid_total = 0\n`);

        if (ordersRes.rows.length === 0) {
            log("✅ No orders need fixing. All orders have correct paid_total.");
            await pool.end();
            fs.writeFileSync('./backfill_output.txt', lines.join('\n'));
            return;
        }

        // Step 2: Process each order
        for (const order of ordersRes.rows) {
            log(`\n--- Order #${order.display_id} ---`);

            try {
                // Check for captured payments
                const paymentsQuery = `
                    SELECT p.id, p.amount, p.data, p.currency_code
                    FROM payment p
                    INNER JOIN order_payment_collection opc 
                        ON opc.payment_collection_id = p.payment_collection_id
                    WHERE opc.order_id = $1
                      AND p.captured_at IS NOT NULL
                `;
                const paymentsRes = await pool.query(paymentsQuery, [order.order_id]);

                if (paymentsRes.rows.length === 0) {
                    log(`   ⏭️ No captured payments found`);
                    continue;
                }

                // Check existing transactions
                const existingTxRes = await pool.query(
                    `SELECT id FROM order_transaction WHERE order_id = $1`,
                    [order.order_id]
                );

                // Create transactions if needed
                for (const payment of paymentsRes.rows) {
                    const hasTx = await pool.query(
                        `SELECT id FROM order_transaction WHERE order_id = $1 AND reference = $2`,
                        [order.order_id, payment.id]
                    );

                    if (hasTx.rows.length === 0) {
                        const amount = Number(payment.amount);
                        const rawAmount = JSON.stringify({ value: String(amount), precision: 20 });
                        const currencyCode = payment.currency_code || order.currency_code || 'inr';
                        const razorpayPaymentId = payment.data?.razorpay_payment_id || payment.id;

                        await pool.query(`
                            INSERT INTO order_transaction (
                                id, order_id, version, amount, raw_amount, currency_code,
                                reference, reference_id, created_at, updated_at
                            ) VALUES (
                                gen_random_uuid(), $1, 1, $2, $3, $4, $5, $6, now(), now()
                            )
                        `, [order.order_id, amount, rawAmount, currencyCode.toLowerCase(), payment.id, razorpayPaymentId]);

                        log(`   ✅ Created transaction for payment ${payment.id} (₹${amount})`);
                        transactionsCreated++;
                    }
                }

                // Calculate total from transactions
                const txSumRes = await pool.query(
                    `SELECT COALESCE(SUM(amount), 0) as total FROM order_transaction WHERE order_id = $1`,
                    [order.order_id]
                );
                const txTotal = Number(txSumRes.rows[0].total);

                // Update order_summary.totals
                if (txTotal > 0 && order.paid_total === 0) {
                    const orderTotal = Number(order.order_total);
                    const updatedTotals = {
                        ...order.totals,
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
                    `, [JSON.stringify(updatedTotals), order.order_id]);

                    log(`   ✅ Updated order_summary: paid_total = ₹${txTotal}`);
                    summariesUpdated++;
                }

                ordersFixed++;
            } catch (orderError: any) {
                log(`   ❌ Error: ${orderError.message}`);
            }
        }

        // Summary
        log("\n===========================================");
        log("📊 BACKFILL COMPLETE - SUMMARY");
        log("===========================================");
        log(`   Orders fixed:          ${ordersFixed}`);
        log(`   Transactions created:  ${transactionsCreated}`);
        log(`   Summaries updated:     ${summariesUpdated}`);
        log("===========================================\n");

        if (ordersFixed > 0) {
            log("✅ Backfill successful! Refresh Medusa Admin to verify.");
        }

    } catch (error: any) {
        log("❌ Backfill script failed: " + error.message);
    } finally {
        await pool.end();
        fs.writeFileSync('./backfill_output.txt', lines.join('\n'));
    }
}

backfillOrderTransactions();
