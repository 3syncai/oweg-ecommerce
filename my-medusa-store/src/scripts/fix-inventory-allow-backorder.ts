// src/scripts/fix-inventory-allow-backorder.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    const displayId = 149; 
    console.log(`=== Enabling Backorder for Order #${displayId} items ===`);

    const orderRes = await pool.query(`SELECT id FROM "order" WHERE display_id = $1`, [displayId]);
    if (orderRes.rowCount === 0) { console.log('Order not found'); return; }
    const orderId = orderRes.rows[0].id;

    // Get variants
    const itemsRes = await pool.query(`
        SELECT oli.variant_id, oli.title
        FROM order_item oi
        JOIN order_line_item oli ON oi.item_id = oli.id
        WHERE oi.order_id = $1
    `, [orderId]);

    for (const item of itemsRes.rows) {
        if (!item.variant_id) continue;
        console.log(`Setting allow_backorder = true for variant: ${item.title} (${item.variant_id})`);
        
        await pool.query(`
            UPDATE product_variant 
            SET allow_backorder = true, updated_at = now()
            WHERE id = $1
        `, [item.variant_id]);
    }
    
    console.log('✅ Updated variants to allow backorders.');
    await pool.end();
}

main().catch(console.error);
