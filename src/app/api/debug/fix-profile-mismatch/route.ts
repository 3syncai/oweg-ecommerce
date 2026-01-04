import { NextResponse } from "next/server";
import { Pool } from 'pg';
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Hardcoded Default Profile ID (the only one that exists)
const DEFAULT_PROFILE_ID = "sp_01KA3RBYCYGNZSNGGXY2MW5MFH";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("id");

    if (!orderId || !process.env.DATABASE_URL) {
        return NextResponse.json({ error: "Missing config" }, { status: 400 });
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        const results: any[] = [];

        // 1. Get Product IDs from Order (using correct v2 JOIN)
        const itemsRes = await pool.query(`
            SELECT oli.product_id, oli.title
            FROM order_item oi
            JOIN order_line_item oli ON oi.item_id = oli.id
            WHERE oi.order_id = $1
        `, [orderId]);

        if (itemsRes.rowCount === 0) {
            await pool.end();
            return NextResponse.json({ error: "No items found" });
        }

        for (const item of itemsRes.rows) {
            // 2. Check existing link in product_shipping_profile
            const linkRes = await pool.query(`
                SELECT * FROM product_shipping_profile
                WHERE product_id = $1
            `, [item.product_id]);

            if (linkRes.rowCount === 0) {
                // MISSING LINK: Insert it with generated ID
                const newId = `prodsp_${crypto.randomUUID()}`;
                await pool.query(`
                    INSERT INTO product_shipping_profile (id, product_id, shipping_profile_id)
                    VALUES ($1, $2, $3)
                `, [newId, item.product_id, DEFAULT_PROFILE_ID]);
                results.push({ item: item.title, status: "Fixed: Linked to Default Profile", new_id: newId });
            } else {
                 // EXISTING LINK: Check if it matches
                 const currentProfile = linkRes.rows[0].shipping_profile_id;
                 if (currentProfile !== DEFAULT_PROFILE_ID) {
                     // WRONG PROFILE: Update it
                     await pool.query(`
                        UPDATE product_shipping_profile
                        SET shipping_profile_id = $1
                        WHERE product_id = $2
                     `, [DEFAULT_PROFILE_ID, item.product_id]);
                     results.push({ item: item.title, status: "Fixed: Updated to Default Profile", old_profile: currentProfile });
                 } else {
                     results.push({ item: item.title, status: "Already Correct" });
                 }
            }
        }

        await pool.end();
        return NextResponse.json({ success: true, results });
    } catch (e) {
        await pool.end();
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
