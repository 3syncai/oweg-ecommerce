// src/scripts/fix-shipping-profile-link.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    const productId = 'prod_01KA3T0NJVMNHCYYJN2567TCRY'; // From debug output
    const defaultProfileId = 'sp_01KA3RBYCYGNZSNGGXY2MW5MFH'; // From debug output
    
    console.log(`=== Linking Product to Default Shipping Profile ===`);
    console.log(`Product ID: ${productId}`);
    console.log(`Profile ID: ${defaultProfileId}`);

    // 1. Check if already linked
    const checkRes = await pool.query(`
        SELECT id FROM product_shipping_profile 
        WHERE product_id = $1 AND shipping_profile_id = $2
    `, [productId, defaultProfileId]);

    if ((checkRes.rowCount || 0) > 0) {
        console.log('⚠️ Product is already linked to this profile.');
        return;
    }

    // 2. Insert Link
    // Schema: product_id, shipping_profile_id, id, created_at, updated_at, deleted_at
    const linkId = `psp_${randomUUID()}`;
    
    await pool.query(`
        INSERT INTO product_shipping_profile (
            id, product_id, shipping_profile_id, created_at, updated_at
        ) VALUES (
            $1, $2, $3, now(), now()
        )
    `, [linkId, productId, defaultProfileId]);

    console.log(`✅ Successfully linked product to Default Shipping Profile.`);
    await pool.end();
}

main().catch(console.error);
