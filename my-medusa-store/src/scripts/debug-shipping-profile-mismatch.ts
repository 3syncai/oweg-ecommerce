// src/scripts/debug-shipping-profile-mismatch.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    const displayId = 149;
    console.log(`=== Debugging Shipping Profile Mismatch for Order #${displayId} ===`);

    const orderRes = await pool.query(`SELECT id FROM "order" WHERE display_id = $1`, [displayId]);
    if (orderRes.rowCount === 0) { console.log('Order not found'); return; }
    const orderId = orderRes.rows[0].id;

    // 1. Get Shipping Option & Its Profile
    console.log('\n🚚 Order Shipping Methods:');
    const shpRes = await pool.query(`
        SELECT osm.id, osm.name, osm.shipping_option_id, so.shipping_profile_id, sp.name as profile_name
        FROM order_shipping os
        JOIN order_shipping_method osm ON os.shipping_method_id = osm.id
        LEFT JOIN shipping_option so ON osm.shipping_option_id = so.id
        LEFT JOIN shipping_profile sp ON so.shipping_profile_id = sp.id
        WHERE os.order_id = $1
    `, [orderId]);
    console.table(shpRes.rows);

    const optionProfileId = shpRes.rows[0]?.shipping_profile_id;
    if (!optionProfileId) {
         console.log('❌ FATAL: Shipping Option has no Shipping Profile found.');
    }

    // 2. Get Order Items & Their Product Profiles
    console.log('\n📦 Order Items Product Profiles:');
    const itemsRes = await pool.query(`
        SELECT 
            oli.title, 
            oli.variant_id, 
            p.id as product_id, 
            psp.shipping_profile_id, 
            sp.name as product_profile_name
        FROM order_item oi
        JOIN order_line_item oli ON oi.item_id = oli.id
        JOIN product_variant pv ON oli.variant_id = pv.id
        JOIN product p ON pv.product_id = p.id
        LEFT JOIN product_shipping_profile psp ON p.id = psp.product_id
        LEFT JOIN shipping_profile sp ON psp.shipping_profile_id = sp.id
        WHERE oi.order_id = $1
    `, [orderId]);

    console.table(itemsRes.rows);

    // 3. Compare
    for (const item of itemsRes.rows) {
        if (item.shipping_profile_id !== optionProfileId) {
            console.log(`\n❌ MISMATCH DETECTED for "${item.title}"`);
            console.log(`   Product Profile: ${item.shipping_profile_id} (${item.product_profile_name})`);
            console.log(`   Option Profile:  ${optionProfileId} (${shpRes.rows[0]?.profile_name})`);
            console.log('   -> This explains why the item is filtered out of fulfillment.');
        } else {
            console.log(`\n✅ Match for "${item.title}"`);
        }
    }

    await pool.end();
}

main().catch(console.error);
