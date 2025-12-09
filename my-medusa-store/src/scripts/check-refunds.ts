/**
 * Check refund table structure and linked refunds
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

async function checkRefunds(): Promise<void> {
    log("\n========================================");
    log("🔍 CHECKING REFUND TABLE");
    log("========================================\n");

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        // Check refund table schema
        log("📋 Refund table schema:\n");
        const schema = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'refund'
            ORDER BY ordinal_position
        `);
        schema.rows.forEach((r: any) => log(`  ${r.column_name}: ${r.data_type}`));

        // Check all refund entries
        log("\n\n📋 ALL refund table entries:\n");
        const allRefunds = await pool.query(`SELECT * FROM refund ORDER BY created_at DESC LIMIT 20`);
        log(`Found ${allRefunds.rows.length} refund entries`);
        allRefunds.rows.forEach((r: any) => log(`  ${JSON.stringify(r)}`));

        // Check for refund entries linked to payments
        log("\n\n📋 Refunds linked to orders via payment:\n");
        try {
            const linkedRefunds = await pool.query(`
                SELECT r.*, o.display_id
                FROM refund r
                JOIN payment p ON p.id = r.payment_id
                JOIN order_payment_collection opc ON opc.payment_collection_id = p.payment_collection_id
                JOIN "order" o ON o.id = opc.order_id
                ORDER BY r.created_at DESC
                LIMIT 10
            `);
            log(`Found ${linkedRefunds.rows.length} linked refunds`);
            linkedRefunds.rows.forEach((r: any) => log(`  Order #${r.display_id}: ${JSON.stringify(r)}`));
        } catch (e: any) {
            log(`Error querying linked refunds: ${e.message}`);
        }

        // Check capture table entries
        log("\n\n📋 Capture table entries (payment captures):\n");
        const captures = await pool.query(`
            SELECT c.id, c.amount, c.payment_id, c.created_at
            FROM capture c
            ORDER BY c.created_at DESC
            LIMIT 10
        `);
        log(`Found ${captures.rows.length} capture entries`);
        captures.rows.forEach((r: any) => log(`  ${r.id}: amount=${r.amount}`));

    } catch (error: any) {
        log("❌ Error: " + error.message);
    } finally {
        await pool.end();
        fs.writeFileSync('./refund_check_output.txt', lines.join('\n'));
        log('\n✅ Output written to: ./refund_check_output.txt');
    }
}

checkRefunds();
