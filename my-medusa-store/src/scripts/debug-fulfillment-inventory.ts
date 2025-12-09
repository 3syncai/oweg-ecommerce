// src/scripts/debug-fulfillment-inventory.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    const displayId = 149; // Default to 149
    console.log(`=== Debugging Fulfillment Inventory for Order #${displayId} ===`);

    // 1. Get Order & Items
    const orderRes = await pool.query(`SELECT id, sales_channel_id FROM "order" WHERE display_id = $1`, [displayId]);
    if (orderRes.rowCount === 0) { console.log('Order not found'); return; }
    const order = orderRes.rows[0];
    const orderId = order.id;

    console.log(`\n📦 Order Sales Channel ID: ${order.sales_channel_id}`);

    const itemsRes = await pool.query(`
        SELECT 
            oi.id as order_item_id, 
            oli.id as line_item_id,
            oli.title, 
            oli.variant_id, 
            oi.quantity, 
            oli.unit_price,
            oi.fulfilled_quantity,
            oi.return_requested_quantity
        FROM order_item oi
        JOIN order_line_item oli ON oi.item_id = oli.id
        WHERE oi.order_id = $1
    `, [orderId]);

    console.log(`\n📦 Order Items (${itemsRes.rowCount}):`);
    console.table(itemsRes.rows.map(r => ({
        title: r.title.substring(0, 30) + '...',
        variant: r.variant_id,
        qty: r.quantity,
        fulfilled: r.fulfilled_quantity
    })));

    // 2. Check Inventory and Reservations
    for (const item of itemsRes.rows) {
        if (!item.variant_id) {
            console.log(`⚠️ Item "${item.title}" has no variant_id (Custom Item?)`);
            continue;
        }

        console.log(`\n🔍 Checking Variant: ${item.variant_id}`);
        
        // Variant Details
        const variantRes = await pool.query(`
            SELECT id, title, sku, manage_inventory, allow_backorder
            FROM product_variant 
            WHERE id = $1
        `, [item.variant_id]);
        
        const variant = variantRes.rows[0];
        console.table([variant]);

        if (!variant) continue;

        // Check Reservations
        const linkRes = await pool.query(`
            SELECT inventory_item_id 
            FROM product_variant_inventory_item 
            WHERE variant_id = $1
        `, [variant.id]);

        if (linkRes.rowCount === 0) {
            console.log('  ❌ No Inventory Item linked to this variant!');
            continue;
        }

        const invItemId = linkRes.rows[0].inventory_item_id;
        console.log(`  -> Inventory Item ID: ${invItemId}`);

        // Check Reservations for this line item
        const resRes = await pool.query(`
            SELECT id, location_id, quantity, created_at 
            FROM reservation_item 
            WHERE inventory_item_id = $1 AND line_item_id = $2
        `, [invItemId, item.line_item_id]);
        
        if (resRes.rowCount > 0) {
            console.log('     🔒 Found Reservations for this line item:');
            console.table(resRes.rows);
        } else {
            console.log('     🔓 No reservations found for this specific line item.');
        }

        // Check Inventory Levels
        const levelRes = await pool.query(`
            SELECT location_id, stocked_quantity, reserved_quantity, incoming_quantity
            FROM inventory_level
            WHERE inventory_item_id = $1
        `, [invItemId]);

        if (levelRes.rowCount === 0) {
            console.log('     ❌ No Inventory Levels found (not stocked at any location).');
        } else {
            console.log('     Inventory Levels:');
            console.table(levelRes.rows);
        }
    }

    // 3. List Stock Locations & Sales Channel Map
    console.log('\n🔗 Sales Channel -> Stock Location Links:');
    const scMapRes = await pool.query(`
        SELECT scsl.sales_channel_id, sc.name as channel_name, scsl.stock_location_id, sl.name as location_name
        FROM sales_channel_stock_location scsl
        JOIN sales_channel sc ON scsl.sales_channel_id = sc.id
        JOIN stock_location sl ON scsl.stock_location_id = sl.id
    `);
    console.table(scMapRes.rows);

    await pool.end();
}

main().catch(console.error);
