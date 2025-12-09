// src/scripts/fix-missing-shipping.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    const displayId = 149;
    const shippingOptionId = 'so_01KBR9WKS1KWPFG3XW23WCG0N7'; // Standard
    const shippingAmount = 0; // Free shipping for now, or fetch from option

    console.log(`=== Fixing Missing Shipping for Order #${displayId} ===`);

    const orderRes = await pool.query(`SELECT id, currency_code FROM "order" WHERE display_id = $1`, [displayId]);
    if (orderRes.rowCount === 0) { console.log('Order not found'); return; }
    const order = orderRes.rows[0];

    // 1. Create Shipping Method
    // Schema: id, name, amount, raw_amount, is_tax_inclusive, shipping_option_id, created_at, updated_at
    const methodId = `osm_${randomUUID()}`;
    const rawAmount = JSON.stringify({ value: String(shippingAmount), precision: 20 });
    
    console.log(`Creating Shipping Method: ${methodId}`);
    
    await pool.query(`
        INSERT INTO order_shipping_method (
            id, name, amount, raw_amount, is_tax_inclusive, 
            shipping_option_id, created_at, updated_at, is_custom_amount
        ) VALUES (
            $1, 'Standard Shipping', $2, $3, false, 
            $4, now(), now(), false
        )
    `, [methodId, shippingAmount, rawAmount, shippingOptionId]);

    // 2. Link to Order
    // Schema: id, order_id, version, shipping_method_id, created_at...
    console.log(`Linking Method to Order: ${order.id}`);
    
    await pool.query(`
        INSERT INTO order_shipping (
            id, order_id, version, shipping_method_id, 
            created_at, updated_at
        ) VALUES (
            gen_random_uuid(), $1, 1, $2, 
            now(), now()
        )
    `, [order.id, methodId]);

    console.log('✅ Successfully added Standard Shipping to Order #149');
    await pool.end();
}

main().catch(console.error);
