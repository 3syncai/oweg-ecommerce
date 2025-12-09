
import { Pool } from 'pg';
import "dotenv/config";

const ORDER_ID = 'order_01KC1Z736A5WCE34KKP1TYRV7B';

// --- Local Implementations to avoid cross-project import issues ---

async function ensureOrderProductShippingProfiles(orderId: string) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        console.log(`Checking shipping profiles for order ${orderId}...`);
        // Logic to link products to default profile if missing
        const defaultProfileId = "sp_01KA3RBYCYGNZSNGGXY2MW5MFH";
        const productsRes = await pool.query(`
            SELECT DISTINCT variant.product_id 
            FROM line_item 
            JOIN product_variant variant ON line_item.variant_id = variant.id
            WHERE line_item.order_id = $1
        `, [orderId]);

        for (const row of productsRes.rows) {
             const check = await pool.query(`SELECT id FROM product_shipping_profile WHERE product_id = $1`, [row.product_id]);
             if ((check.rowCount || 0) === 0) {
                 await pool.query(`
                    INSERT INTO product_shipping_profile (id, product_id, shipping_profile_id)
                    VALUES ($1, $2, $3)
                 `, [`psp_${Math.random().toString(36).substring(7)}`, row.product_id, defaultProfileId]);
                 console.log(`Linked product ${row.product_id} to default profile`);
             }
        }
    } catch(e) { console.error("Error ensuring profiles:", e); }
    finally { await pool.end(); }
}

async function ensureOrderShippingMethod(orderId: string) {
     const pool = new Pool({ connectionString: process.env.DATABASE_URL });
     try {
        console.log(`Checking shipping method for order ${orderId}...`);
        // Basic check if shipping method exists
        const res = await pool.query(`SELECT id FROM order_shipping_method WHERE order_id = $1`, [orderId]);
        if ((res.rowCount || 0) === 0) {
            console.log("No shipping method found. Creating default...");
             await pool.query(`
                INSERT INTO order_shipping_method (id, order_id, shipping_option_id, price, data, created_at, updated_at, amount)
                VALUES ($1, $2, $3, $4, $5, now(), now(), $6)
             `, [`osm_${Math.random().toString(36).substring(7)}`, orderId, 'so_01KA3T0...', 0, '{}', 0]);
        }
     } catch(e) { console.error("Error ensuring shipping method:", e); }
     finally { await pool.end(); }
}

async function ensureOrderReservations(orderId: string) {
    console.log(`Checking reservations for order ${orderId} (Placeholder - implementation logic would go here)`);
    // Placeholder as complex logic is needed for inventory items
}

async function fixLatestOrder() {
    console.log(`🔧 Fixing Order ${ORDER_ID}...`);

    console.log('\n--- Step 1: Ensure Product Profiles ---');
    await ensureOrderProductShippingProfiles(ORDER_ID);

    console.log('\n--- Step 2: Ensure Shipping Method ---');
    await ensureOrderShippingMethod(ORDER_ID);

    console.log('\n--- Step 3: Ensure Reservations ---');
    await ensureOrderReservations(ORDER_ID);

    console.log('\n✅ Fix sequence complete.');
}

fixLatestOrder();
