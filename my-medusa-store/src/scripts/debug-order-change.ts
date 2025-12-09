// src/scripts/debug-order-change.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    const displayId = 149;
    console.log(`=== Debugging Order Change for #${displayId} ===`);

    const orderRes = await pool.query(`SELECT id FROM "order" WHERE display_id = $1`, [displayId]);
    if (orderRes.rowCount === 0) {
        console.log('Order not found');
        return;
    }
    const orderId = orderRes.rows[0].id;

    console.log(`Order ID: ${orderId}`);

    const changeRes = await pool.query(`
        SELECT id, version, change_type, status, created_at 
        FROM order_change 
        WHERE order_id = $1
    `, [orderId]);

    console.log(`\nFound ${changeRes.rowCount} order_change records:`);
    console.table(changeRes.rows);

    for (const change of changeRes.rows) {
        console.log(`\nActions for Change ID ${change.id}:`);
        const actRes = await pool.query(`
            SELECT id, action, details, reference, reference_id, amount, internal_note
            FROM order_change_action 
            WHERE order_change_id = $1
        `, [change.id]);
        console.table(actRes.rows);
    }
    
    await pool.end();
}

main().catch(console.error);
