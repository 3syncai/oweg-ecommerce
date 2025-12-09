/**
 * Debug: Check if multiple payment_collections query works
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function debug(): Promise<void> {
    console.log("\n=== DEBUG: Multiple payment_collections query ===\n");

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // Exact same query from cleanup script
        const multiPcRes = await pool.query(`
            SELECT o.id as order_id, o.display_id, 
                   COUNT(opc.payment_collection_id) as pc_count
            FROM "order" o
            JOIN order_payment_collection opc ON opc.order_id = o.id
            GROUP BY o.id, o.display_id
            HAVING COUNT(opc.payment_collection_id) > 1
            ORDER BY o.created_at DESC
        `);

        console.log(`Query returned ${multiPcRes.rows.length} rows`);
        multiPcRes.rows.forEach((r: any) => {
            console.log(`  Order #${r.display_id}: ${r.pc_count} payment_collections`);
        });

        // Also check the total count in order_payment_collection
        const totalLinks = await pool.query(`SELECT COUNT(*) as cnt FROM order_payment_collection`);
        console.log(`\nTotal order_payment_collection rows: ${totalLinks.rows[0].cnt}`);

        // Check a specific order
        console.log(`\n=== Order #141 payment_collections ===`);
        const order141 = await pool.query(`
            SELECT pc.id, pc.status, pc.amount, opc.order_id
            FROM payment_collection pc
            JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
            JOIN "order" o ON o.id = opc.order_id
            WHERE o.display_id = 141
        `);
        console.log(`Found ${order141.rows.length} rows:`);
        order141.rows.forEach((r: any) => {
            console.log(`  PC: ${r.id}, status: ${r.status}, amount: ${r.amount}, order_id: ${r.order_id}`);
        });

    } catch (error: any) {
        console.log("❌ Error: " + error.message);
        console.error(error);
    } finally {
        await pool.end();
    }
}

debug();
