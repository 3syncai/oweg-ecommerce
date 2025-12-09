import { NextResponse } from "next/server";
import { Pool } from 'pg';
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Hardcoded location from user screenshot
const TARGET_LOCATION_ID = "sloc_01KA3VS3YKZWJF8KJ64GC2ZSS7";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("id");

    if (!orderId || !process.env.DATABASE_URL) {
        return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // 1. Get Items
        const itemsRes = await pool.query(`
            SELECT oli.id as line_item_id, oli.variant_id, oi.quantity, oli.title,
                   oi.id as order_item_id
            FROM order_item oi
            JOIN order_line_item oli ON oi.item_id = oli.id
            WHERE oi.order_id = $1
        `, [orderId]);

        const results: any[] = [];

        for (const item of itemsRes.rows) {
            // 2. Get Inventory Item
            const invRes = await pool.query(`
                SELECT inventory_item_id
                FROM product_variant_inventory_item
                WHERE variant_id = $1
            `, [item.variant_id]);

            if (invRes.rowCount === 0) {
                results.push({ item: item.title, status: "No Inventory Item" });
                continue;
            }

            const inventoryItemId = invRes.rows[0].inventory_item_id;

            // 3. Ensure Inventory Level (Stock at Location)
            const levelRes = await pool.query(`
                SELECT id, stocked_quantity FROM inventory_level
                WHERE inventory_item_id = $1 AND location_id = $2
            `, [inventoryItemId, TARGET_LOCATION_ID]);

            if (levelRes.rowCount === 0) {
                // Create Level
                await pool.query(`
                    INSERT INTO inventory_level (
                        id, inventory_item_id, location_id, 
                        stocked_quantity, reserved_quantity, incoming_quantity,
                        created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), $1, $2,
                        100, 0, 0,
                        now(), now()
                    )
                `, [inventoryItemId, TARGET_LOCATION_ID]);
                results.push({ item: item.title, status: "Inventory Level Created", type: "level" });
            } else {
                // Ensure enough stock
                 const currentStock = Number(levelRes.rows[0].stocked_quantity);
                 if (currentStock < 10) {
                     await pool.query(`
                        UPDATE inventory_level SET stocked_quantity = 100 WHERE inventory_item_id = $1 AND location_id = $2
                     `, [inventoryItemId, TARGET_LOCATION_ID]);
                     results.push({ item: item.title, status: "Stock Updated to 100", type: "level" });
                 }
            }

            // 4. Check existing reservation
            const existingRes = await pool.query(`
                SELECT id FROM reservation_item 
                WHERE line_item_id = $1 
                AND location_id = $2
            `, [item.line_item_id, TARGET_LOCATION_ID]);

            if (existingRes.rowCount && existingRes.rowCount > 0) {
                results.push({ item: item.title, status: "Reservation Exists", type: "reservation" });
                continue;
            }

            // 5. Create Reservation
            const reservationId = `resitem_${crypto.randomUUID()}`;
            const rawQuantity = JSON.stringify({ value: String(item.quantity), precision: 20 });

            await pool.query(`
                INSERT INTO reservation_item (
                    id, line_item_id, location_id, quantity, raw_quantity,
                    inventory_item_id, allow_backorder, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, true, now(), now()
                )
            `, [reservationId, item.line_item_id, TARGET_LOCATION_ID, item.quantity, rawQuantity, inventoryItemId]);

            results.push({ item: item.title, status: "Reservation Created", location: TARGET_LOCATION_ID, type: "reservation" });
        }

        await pool.end();
        return NextResponse.json({ success: true, results });
    } catch (e) {
        await pool.end();
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
