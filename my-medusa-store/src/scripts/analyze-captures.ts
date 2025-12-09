/**
 * Deep dive into capture table and payment structure
 * 
 * The standard refund tables are clean, so the issue might be in:
 * 1. How captures are linked to payments
 * 2. How Medusa Admin interprets the payment/capture/refund relationship
 * 3. Some edge case in the payment table data column
 * 
 * Run with: npx ts-node src/scripts/analyze-captures.ts
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

async function analyzeCaptures(): Promise<void> {
    log("\n=====================================================");
    log("🔍 ANALYZING CAPTURE AND PAYMENT STRUCTURE");
    log("=====================================================\n");

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        // 1. List all captures with full details
        log("📋 STEP 1: All capture table entries...\n");
        const captureRes = await pool.query(`
            SELECT c.*, p.amount as payment_amount, p.data as payment_data,
                   p.captured_at, p.canceled_at,
                   pc.id as pc_id, pc.status as pc_status, pc.captured_amount, pc.refunded_amount,
                   o.display_id
            FROM capture c
            JOIN payment p ON p.id = c.payment_id
            JOIN payment_collection pc ON pc.id = p.payment_collection_id
            JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
            JOIN "order" o ON o.id = opc.order_id
            ORDER BY c.created_at DESC
            LIMIT 20
        `);

        log(`Found ${captureRes.rows.length} capture entries:`);
        captureRes.rows.forEach((c: any, i: number) => {
            log(`\n  [${i + 1}] Order #${c.display_id}:`);
            log(`      capture_id: ${c.id}`);
            log(`      capture_amount: ${c.amount}`);
            log(`      payment_id: ${c.payment_id}`);
            log(`      payment_amount: ${c.payment_amount}`);
            log(`      pc_captured_amount: ${c.captured_amount}`);
            log(`      pc_refunded_amount: ${c.refunded_amount}`);
            log(`      pc_status: ${c.pc_status}`);
            log(`      payment_data: ${JSON.stringify(c.payment_data)?.substring(0, 200)}...`);
        });

        // 2. Check if there are multiple captures or refunds per payment
        log("\n\n📋 STEP 2: Payments with multiple captures or any refunds...\n");
        const multiCapRes = await pool.query(`
            SELECT p.id as payment_id, 
                   COUNT(c.id) as capture_count,
                   (SELECT COUNT(*) FROM refund r WHERE r.payment_id = p.id) as refund_count,
                   o.display_id
            FROM payment p
            LEFT JOIN capture c ON c.payment_id = p.id
            JOIN payment_collection pc ON pc.id = p.payment_collection_id
            JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
            JOIN "order" o ON o.id = opc.order_id
            GROUP BY p.id, o.display_id
            HAVING COUNT(c.id) > 1 OR (SELECT COUNT(*) FROM refund r WHERE r.payment_id = p.id) > 0
            LIMIT 20
        `);

        log(`Found ${multiCapRes.rows.length} payments with multiple captures or refunds:`);
        if (multiCapRes.rows.length === 0) {
            log("  ✅ All payments have exactly 1 capture and 0 refunds");
        } else {
            multiCapRes.rows.forEach((r: any) => {
                log(`  Order #${r.display_id}: capture_count=${r.capture_count}, refund_count=${r.refund_count}`);
            });
        }

        // 3. Check if capture amounts match payment amounts
        log("\n\n📋 STEP 3: Comparing capture vs payment amounts...\n");
        const mismatchRes = await pool.query(`
            SELECT c.id as capture_id, c.amount as capture_amount,
                   p.amount as payment_amount,
                   c.amount::numeric - p.amount::numeric as diff,
                   o.display_id
            FROM capture c
            JOIN payment p ON p.id = c.payment_id
            JOIN payment_collection pc ON pc.id = p.payment_collection_id
            JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
            JOIN "order" o ON o.id = opc.order_id
            WHERE c.amount::numeric != p.amount::numeric
            LIMIT 20
        `);

        log(`Found ${mismatchRes.rows.length} capture/payment amount mismatches:`);
        if (mismatchRes.rows.length === 0) {
            log("  ✅ All capture amounts match payment amounts");
        } else {
            mismatchRes.rows.forEach((r: any) => {
                log(`  Order #${r.display_id}: capture=${r.capture_amount}, payment=${r.payment_amount}, diff=${r.diff}`);
            });
        }

        // 4. Check Medusa Admin related tables - order_change, order_edit, etc.
        log("\n\n📋 STEP 4: Checking for order changes or edits...\n");
        
        try {
            const orderChangeRes = await pool.query(`
                SELECT oc.*, o.display_id
                FROM order_change oc
                JOIN "order" o ON o.id = oc.order_id
                ORDER BY oc.created_at DESC
                LIMIT 10
            `);
            log(`Found ${orderChangeRes.rows.length} order_change entries`);
            orderChangeRes.rows.forEach((r: any) => {
                log(`  Order #${r.display_id}: change_type=${r.change_type}, status=${r.status}`);
            });
        } catch (e) {
            log("  order_change table not found or error");
        }

        // 5. Check all payment module tables
        log("\n\n📋 STEP 5: Listing all payment-related tables...\n");
        const tablesRes = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND (table_name LIKE '%payment%' OR table_name LIKE '%refund%' OR table_name LIKE '%capture%')
            ORDER BY table_name
        `);
        
        log("Payment-related tables:");
        tablesRes.rows.forEach((r: any) => {
            log(`  - ${r.table_name}`);
        });

        // 6. Check for any payment session issues
        log("\n\n📋 STEP 6: Checking payment_session status...\n");
        const sessionRes = await pool.query(`
            SELECT ps.id, ps.status, ps.amount, ps.provider_id,
                   pc.id as pc_id, o.display_id
            FROM payment_session ps
            JOIN payment_collection pc ON pc.id = ps.payment_collection_id
            JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
            JOIN "order" o ON o.id = opc.order_id
            WHERE ps.status NOT IN ('authorized', 'captured')
            ORDER BY ps.created_at DESC
            LIMIT 20
        `);

        log(`Found ${sessionRes.rows.length} payment sessions with unusual status:`);
        if (sessionRes.rows.length === 0) {
            log("  ✅ All payment sessions have normal status");
        } else {
            sessionRes.rows.forEach((r: any) => {
                log(`  Order #${r.display_id}: session_status=${r.status}`);
            });
        }

    } catch (error: any) {
        log("❌ Error: " + error.message);
        console.error(error);
    } finally {
        await pool.end();
        fs.writeFileSync('./analyze_captures_output.txt', lines.join('\n'));
        log('\n📝 Full output written to: ./analyze_captures_output.txt');
    }
}

analyzeCaptures();
