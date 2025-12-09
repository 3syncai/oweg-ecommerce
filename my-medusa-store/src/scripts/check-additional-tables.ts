/**
 * Check razorpay_payment and order_change tables for ghost refund sources
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

async function checkAdditionalTables(): Promise<void> {
    log("\n=====================================================");
    log("🔍 CHECKING ADDITIONAL TABLES");
    log("=====================================================\n");

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // 1. Check razorpay_payment table schema
        log("📋 STEP 1: razorpay_payment table schema...\n");
        const schemaRes = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'razorpay_payment'
            ORDER BY ordinal_position
        `);
        schemaRes.rows.forEach((r: any) => log(`  ${r.column_name}: ${r.data_type}`));

        // 2. Check razorpay_payment entries
        log("\n\n📋 STEP 2: razorpay_payment table entries...\n");
        const rpRes = await pool.query('SELECT * FROM razorpay_payment ORDER BY created_at DESC LIMIT 20');
        log(`Found ${rpRes.rows.length} razorpay_payment entries:`);
        rpRes.rows.forEach((r: any, i: number) => {
            log(`\n  [${i + 1}] ${JSON.stringify(r)}`);
        });

        // 3. Check order_change_action table schema
        log("\n\n📋 STEP 3: order_change_action table schema...\n");
        try {
            const ocaSchema = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'order_change_action'
                ORDER BY ordinal_position
            `);
            ocaSchema.rows.forEach((r: any) => log(`  ${r.column_name}: ${r.data_type}`));
        } catch (e) {
            log("  order_change_action table not found");
        }

        // 4. Check order_change and order_change_action for recent orders
        log("\n\n📋 STEP 4: order_change entries with actions...\n");
        try {
            const changeRes = await pool.query(`
                SELECT oc.id as change_id, oc.order_id, oc.change_type, oc.status,
                       oca.id as action_id, oca.action, oca.reference, oca.amount,
                       o.display_id
                FROM order_change oc
                LEFT JOIN order_change_action oca ON oca.order_change_id = oc.id
                JOIN "order" o ON o.id = oc.order_id
                ORDER BY oc.created_at DESC
                LIMIT 30
            `);
            log(`Found ${changeRes.rows.length} order_change entries with actions:`);
            changeRes.rows.forEach((r: any, i: number) => {
                log(`\n  [${i + 1}] Order #${r.display_id}:`);
                log(`      change_id: ${r.change_id}`);
                log(`      change_type: ${r.change_type}`);
                log(`      status: ${r.status}`);
                log(`      action_id: ${r.action_id || 'NULL'}`);
                log(`      action: ${r.action || 'NULL'}`);
                log(`      reference: ${r.reference || 'NULL'}`);
                log(`      amount: ${r.amount || 'NULL'}`);
            });
        } catch (e: any) {
            log("  Error: " + e.message);
        }

        // 5. Look for any actions with 'refund' reference
        log("\n\n📋 STEP 5: order_change_action with 'refund' reference...\n");
        try {
            const refundActionRes = await pool.query(`
                SELECT oca.*, oc.change_type, o.display_id
                FROM order_change_action oca
                JOIN order_change oc ON oc.id = oca.order_change_id
                JOIN "order" o ON o.id = oc.order_id
                WHERE oca.reference ILIKE '%refund%' OR oca.action ILIKE '%refund%'
                LIMIT 20
            `);
            log(`Found ${refundActionRes.rows.length} order_change_action with refund reference:`);
            if (refundActionRes.rows.length === 0) {
                log("  ✅ No actions with 'refund' reference");
            } else {
                refundActionRes.rows.forEach((r: any) => {
                    log(`  Order #${r.display_id}: action=${r.action}, reference=${r.reference}`);
                });
            }
        } catch (e: any) {
            log("  Error: " + e.message);
        }

        // 6. Check if there are multiple payment_collections per order
        log("\n\n📋 STEP 6: Orders with multiple payment collections...\n");
        const multiPcRes = await pool.query(`
            SELECT o.display_id, COUNT(opc.payment_collection_id) as pc_count
            FROM "order" o
            JOIN order_payment_collection opc ON opc.order_id = o.id
            GROUP BY o.display_id
            HAVING COUNT(opc.payment_collection_id) > 1
            ORDER BY o.display_id DESC
            LIMIT 20
        `);
        log(`Found ${multiPcRes.rows.length} orders with multiple payment_collections:`);
        if (multiPcRes.rows.length === 0) {
            log("  ✅ All orders have single payment_collection");
        } else {
            multiPcRes.rows.forEach((r: any) => {
                log(`  Order #${r.display_id}: ${r.pc_count} payment_collections`);
            });
        }

    } catch (error: any) {
        log("❌ Error: " + error.message);
        console.error(error);
    } finally {
        await pool.end();
        fs.writeFileSync('./additional_tables_output.txt', lines.join('\n'));
        log('\n📝 Output written to: ./additional_tables_output.txt');
    }
}

checkAdditionalTables();
