/**
 * Investigate multiple payment_collections per order
 * 
 * This is likely the root cause of the "Refund" display issue.
 * When an order has multiple payment_collections, the admin UI might
 * be calculating refunds based on differences between them.
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

async function investigateMultiplePCs(): Promise<void> {
    log("\n=====================================================");
    log("🔍 INVESTIGATING MULTIPLE PAYMENT_COLLECTIONS");
    log("=====================================================\n");

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // Check Order #141 specifically with all its payment_collections
        const targetOrders = [141, 142, 144];
        
        for (const displayId of targetOrders) {
            log(`\n=== ORDER #${displayId} ===\n`);
            
            // Get all payment_collections for this order
            const pcRes = await pool.query(`
                SELECT pc.id, pc.status, pc.amount, pc.captured_amount, pc.refunded_amount,
                       pc.created_at, pc.currency_code
                FROM payment_collection pc
                JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
                JOIN "order" o ON o.id = opc.order_id
                WHERE o.display_id = $1
                ORDER BY pc.created_at ASC
            `, [displayId]);

            log(`Payment collections (${pcRes.rows.length}):`);
            pcRes.rows.forEach((pc: any, i: number) => {
                log(`\n  [${i + 1}] PC ID: ${pc.id}`);
                log(`      status: ${pc.status}`);
                log(`      amount: ${pc.amount}`);
                log(`      captured_amount: ${pc.captured_amount}`);
                log(`      refunded_amount: ${pc.refunded_amount}`);
                log(`      currency_code: ${pc.currency_code}`);
                log(`      created_at: ${pc.created_at}`);
            });

            // Get all payments for each payment_collection
            log(`\nPayments:`);
            const paymentRes = await pool.query(`
                SELECT p.id, p.amount, p.currency_code, p.captured_at, p.canceled_at,
                       p.payment_collection_id, p.data
                FROM payment p
                JOIN payment_collection pc ON pc.id = p.payment_collection_id
                JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
                JOIN "order" o ON o.id = opc.order_id
                WHERE o.display_id = $1
                ORDER BY p.created_at ASC
            `, [displayId]);

            if (paymentRes.rows.length === 0) {
                log("  (no payments)");
            } else {
                paymentRes.rows.forEach((p: any, i: number) => {
                    log(`\n  [${i + 1}] Payment ID: ${p.id}`);
                    log(`      amount: ${p.amount}`);
                    log(`      captured_at: ${p.captured_at}`);
                    log(`      canceled_at: ${p.canceled_at}`);
                    log(`      pc_id: ${p.payment_collection_id}`);
                    if (p.data?.razorpay_payment_id) {
                        log(`      razorpay_payment_id: ${p.data.razorpay_payment_id}`);
                    }
                });
            }

            // Get all captures
            log(`\nCaptures:`);
            const captureRes = await pool.query(`
                SELECT c.id, c.amount, c.payment_id, c.created_at
                FROM capture c
                JOIN payment p ON p.id = c.payment_id
                JOIN payment_collection pc ON pc.id = p.payment_collection_id
                JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
                JOIN "order" o ON o.id = opc.order_id
                WHERE o.display_id = $1
                ORDER BY c.created_at ASC
            `, [displayId]);

            if (captureRes.rows.length === 0) {
                log("  (no captures)");
            } else {
                captureRes.rows.forEach((c: any, i: number) => {
                    log(`  [${i + 1}] Capture: ${c.id}, amount=${c.amount}`);
                });
            }

            // Get all refunds
            log(`\nRefunds:`);
            const refundRes = await pool.query(`
                SELECT r.id, r.amount, r.payment_id, r.created_at
                FROM refund r
                JOIN payment p ON p.id = r.payment_id
                JOIN payment_collection pc ON pc.id = p.payment_collection_id
                JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
                JOIN "order" o ON o.id = opc.order_id
                WHERE o.display_id = $1
                ORDER BY r.created_at ASC
            `, [displayId]);

            if (refundRes.rows.length === 0) {
                log("  (no refunds)");
            } else {
                refundRes.rows.forEach((r: any, i: number) => {
                    log(`  [${i + 1}] Refund: ${r.id}, amount=${r.amount} ⚠️`);
                });
            }

            // Get order_transactions
            log(`\nOrder Transactions:`);
            const txRes = await pool.query(`
                SELECT ot.id, ot.amount, ot.reference, ot.reference_id
                FROM order_transaction ot
                JOIN "order" o ON o.id = ot.order_id
                WHERE o.display_id = $1
                ORDER BY ot.created_at ASC
            `, [displayId]);

            if (txRes.rows.length === 0) {
                log("  (no order_transactions)");
            } else {
                txRes.rows.forEach((t: any, i: number) => {
                    log(`  [${i + 1}] TX: amount=${t.amount}, ref=${t.reference}`);
                });
            }
        }

        // Summary analysis
        log("\n\n=====================================================");
        log("📊 ANALYSIS");
        log("=====================================================\n");
        
        // Check if the first PC has different amounts than second
        const analysisRes = await pool.query(`
            WITH pc_nums AS (
                SELECT 
                    o.display_id,
                    pc.id as pc_id,
                    pc.status,
                    pc.amount,
                    pc.captured_amount,
                    ROW_NUMBER() OVER (PARTITION BY o.display_id ORDER BY pc.created_at) as pc_num
                FROM payment_collection pc
                JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
                JOIN "order" o ON o.id = opc.order_id
                WHERE o.display_id IN (141, 142, 144)
            )
            SELECT * FROM pc_nums ORDER BY display_id, pc_num
        `);

        log("Payment collection analysis:");
        analysisRes.rows.forEach((r: any) => {
            log(`  Order #${r.display_id}, PC#${r.pc_num}: status=${r.status}, amount=${r.amount}, captured=${r.captured_amount}`);
        });

    } catch (error: any) {
        log("❌ Error: " + error.message);
        console.error(error);
    } finally {
        await pool.end();
        fs.writeFileSync('./multiple_pcs_output.txt', lines.join('\n'));
        log('\n📝 Output written to: ./multiple_pcs_output.txt');
    }
}

investigateMultiplePCs();
