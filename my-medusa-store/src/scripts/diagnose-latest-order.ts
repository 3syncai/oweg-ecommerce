import { Pool } from 'pg';
import "dotenv/config";

async function diagnoseLatestOrder() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL missing');
        return;
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // 1. Get Latest Order
        const orderRes = await pool.query(`
            SELECT id, display_id, created_at 
            FROM "order" 
            ORDER BY created_at DESC 
            LIMIT 1
        `);

        if (orderRes.rowCount === 0) {
            console.log("No orders found.");
            return;
        }

        const order = orderRes.rows[0];
        console.log(`📦 Latest Order: #${order.display_id} (${order.id})`);

        // 2. Check Shipping Method
        const shipRes = await pool.query(`
            SELECT osm.id, osm.name, osm.shipping_option_id 
            FROM order_shipping os
            JOIN order_shipping_method osm ON os.shipping_method_id = osm.id
            WHERE os.order_id = $1
        `, [order.id]);

        if (shipRes.rowCount === 0) {
            console.error("❌ No Shipping Method attached!");
        } else {
            console.log(`✅ Shipping Method: ${shipRes.rows[0].name} (Option: ${shipRes.rows[0].shipping_option_id})`);
            const optionId = shipRes.rows[0].shipping_option_id;

            // Get Profile for this Option
            const optRes = await pool.query(`SELECT shipping_profile_id FROM shipping_option WHERE id = $1`, [optionId]);
            const optionProfileId = optRes.rows[0]?.shipping_profile_id;
            console.log(`ℹ️ Shipping Option Profile ID: ${optionProfileId}`);

            // 3. Check Products & Their Profiles
            const itemsRes = await pool.query(`
                SELECT oli.id, oli.title, oli.variant_id
                FROM order_item oi
                JOIN order_line_item oli ON oi.item_id = oli.id
                WHERE oi.order_id = $1
            `, [order.id]);

            for (const item of itemsRes.rows) {
                console.log(`\n🔸 Item: ${item.title}`);
                if (!item.variant_id) {
                    console.log("   - No variant ID (Custom item?)");
                    continue;
                }

                // Get Product ID
                const prodRes = await pool.query(`SELECT product_id FROM product_variant WHERE id = $1`, [item.variant_id]);
                const productId = prodRes.rows[0]?.product_id;
                console.log(`   - Product ID: ${productId}`);

                if (productId) {
                    // Check Product Profile
                    const profRes = await pool.query(`
                        SELECT shipping_profile_id 
                        FROM product_shipping_profile 
                        WHERE product_id = $1
                    `, [productId]);

                    const productProfileId = profRes.rows[0]?.shipping_profile_id;
                    
                    if (!productProfileId) {
                        console.error('   ❌ MISSING Shipping Profile for Product!');
                    } else if (productProfileId !== optionProfileId) {
                        console.error(`   ❌ PROFILE MISMATCH! Product has ${productProfileId}, Option needs ${optionProfileId}`);
                    } else {
                        console.log(`   ✅ Profile Match: ${productProfileId}`);
                    }
                }
            }
        }

        // 4. Check Reservations
        const resRes = await pool.query(`
             SELECT oli.id, COUNT(ri.id) as res_count
            FROM order_item oi
            JOIN order_line_item oli ON oi.item_id = oli.id
            LEFT JOIN reservation_item ri ON oli.id = ri.line_item_id
            WHERE oi.order_id = $1
            GROUP BY oli.id
        `, [order.id]);

        console.log("\n🔒 Reservations:");
        resRes.rows.forEach(r => {
             console.log(`   - Item ${r.id}: ${r.res_count > 0 ? '✅ Reserved' : '❌ No Reservation'}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

diagnoseLatestOrder();
