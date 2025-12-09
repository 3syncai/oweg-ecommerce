// src/scripts/debug-fulfillment-shipping.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    const displayId = 149; // Using 149 from context, user screenshot shows 149
    console.log(`=== Debugging Shipping & Location for Order #${displayId} ===`);

    const orderRes = await pool.query(`SELECT id, sales_channel_id, currency_code FROM "order" WHERE display_id = $1`, [displayId]);
    if (orderRes.rowCount === 0) { console.log('Order not found'); return; }
    const order = orderRes.rows[0];
    
    // 1. Get Shipping Methods via order_shipping link table
    const shpRes = await pool.query(`
        SELECT osm.id, osm.shipping_option_id, osm.amount, osm.name
        FROM order_shipping os
        JOIN order_shipping_method osm ON os.shipping_method_id = osm.id
        WHERE os.order_id = $1
    `, [order.id]);

    console.log(`\n🚚 Order Shipping Methods:`);
    console.table(shpRes.rows);

    for (const shp of shpRes.rows) {
        if (!shp.shipping_option_id) {
            console.log(`  ❌ Method "${shp.name}" has no shipping_option_id (Custom?)`);
            continue;
        }

        console.log(`\n🔍 Checking Option: ${shp.shipping_option_id}`);
        
        // 2. Check Shipping Option & Service Zone
        const optRes = await pool.query(`
            SELECT so.id, so.name, so.service_zone_id, so.shipping_profile_id
            FROM shipping_option so
            WHERE id = $1
        `, [shp.shipping_option_id]);
        
        const option = optRes.rows[0];
        console.table([option]);

        if (option) {
            // 3. Check Fulfillment Set & Location
            const fsetRes = await pool.query(`
                SELECT fs.id, fs.name, fs.type
                FROM service_zone sz
                JOIN fulfillment_set fs ON sz.fulfillment_set_id = fs.id
                WHERE sz.id = $1
            `, [option.service_zone_id]);
            
            console.log('  🏭 Fulfillment Set (via Service Zone):');
            console.table(fsetRes.rows);

            for (const fs of fsetRes.rows) {
                // Check Location Link
                const locRes = await pool.query(`
                    SELECT stock_location_id 
                    FROM location_fulfillment_set 
                    WHERE fulfillment_set_id = $1
                `, [fs.id]);
                
                if (locRes.rowCount === 0) {
                    console.log(`     ⚠️ Fulfillment Set "${fs.name}" is NOT linked to any Stock Location!`);
                } else {
                    console.log(`     ✅ Linked to Stock Location(s):`);
                    console.table(locRes.rows);
                }
            }
        }
    }

    await pool.end();
}

main().catch(console.error);
