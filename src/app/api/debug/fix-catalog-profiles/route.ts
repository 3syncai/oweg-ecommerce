import { NextResponse } from "next/server";
import { Pool } from 'pg';
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Hardcoded Default Profile ID (the only one that exists)
const DEFAULT_PROFILE_ID = "sp_01KA3RBYCYGNZSNGGXY2MW5MFH";

export async function GET(_req: Request) {
    if (!process.env.DATABASE_URL) {
        return NextResponse.json({ error: "No DB URL" }, { status: 400 });
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        const results: any[] = [];
        let fixedCount = 0;

        // 1. Get ALL Products
        const productsRes = await pool.query(`SELECT id, title FROM product`);

        for (const product of productsRes.rows) {
            // 2. Check existing link in product_shipping_profile
            const linkRes = await pool.query(`
                SELECT * FROM product_shipping_profile
                WHERE product_id = $1
            `, [product.id]);

            if (linkRes.rowCount === 0) {
                // MISSING LINK: Insert it with generated ID
                const newId = `prodsp_${crypto.randomUUID()}`;
                await pool.query(`
                    INSERT INTO product_shipping_profile (id, product_id, shipping_profile_id)
                    VALUES ($1, $2, $3)
                `, [newId, product.id, DEFAULT_PROFILE_ID]);
                results.push({ item: product.title, status: "Fixed: Linked to Default Profile", new_id: newId });
                fixedCount++;
            } else {
                 // EXISTING LINK: Check if it matches default
                 const currentProfile = linkRes.rows[0].shipping_profile_id;
                 if (currentProfile !== DEFAULT_PROFILE_ID) {
                     // WRONG PROFILE: Update it
                     await pool.query(`
                        UPDATE product_shipping_profile
                        SET shipping_profile_id = $1
                        WHERE product_id = $2
                     `, [DEFAULT_PROFILE_ID, product.id]);
                     results.push({ item: product.title, status: "Fixed: Updated to Default Profile", old_profile: currentProfile });
                     fixedCount++;
                 } 
                 // If matches, do nothing (commented out to save output size)
                 // else { results.push({ item: product.title, status: "OK" }); }
            }
        }

        await pool.end();
        return NextResponse.json({ 
            success: true, 
            total_products: productsRes.rowCount,
            fixed_products: fixedCount, 
            details: results 
        });
    } catch (e) {
        await pool.end();
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
