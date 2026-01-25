import { Client } from 'pg';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const medusaClient = new Client({
    connectionString: process.env.DATABASE_URL,
});

// Old OpenCart Credentials
const ocConfig = {
    host: '147.93.31.253',
    port: 3306,
    user: 'oweg_user2',
    password: 'Oweg#@123',
    database: 'oweg_db',
};

async function syncPrices() {
    let ocConnection;
    try {
        console.log('Connecting to Medusa DB...');
        await medusaClient.connect();

        console.log('Connecting to OpenCart DB...');
        ocConnection = await mysql.createConnection(ocConfig);

        // 1. Fetch all variants from Medusa
        console.log('Fetching variants from Medusa...');
        const medusaVariants = await medusaClient.query(
            `SELECT v.id, v.sku, v.product_id 
         FROM product_variant v
         LEFT JOIN product_variant_price_set pvps ON v.id = pvps.variant_id
         WHERE pvps.price_set_id IS NULL`
        );

        console.log(`Found ${medusaVariants.rows.length} variants without prices in Medusa.`);

        let updatedCount = 0;

        for (const variant of medusaVariants.rows) {
            if (!variant.sku) continue;

            let ocPrice = 0;
            let finalSku = variant.sku;

            // 2. Find product in OpenCart by SKU (Model)
            const [ocProducts] = await ocConnection.execute(
                `SELECT price, product_id, model FROM oc_product WHERE model = ? LIMIT 1`,
                [variant.sku]
            ) as any[];

            if (ocProducts.length > 0) {
                console.log(`MATCH FOUND for SKU: ${variant.sku}`);
                ocPrice = parseFloat(ocProducts[0].price);
            } else {
                // Fallback: Try parent SKU (e.g. RJD210-44 -> RJD210)
                // Assuming SKU format is PARENT-VARIANT
                const parts = variant.sku.split('-');
                if (parts.length > 1) {
                    // Try removing the last part
                    const parentSku = parts.slice(0, -1).join('-');
                    const [parentProducts] = await ocConnection.execute(
                        `SELECT price, product_id, model FROM oc_product WHERE model = ? LIMIT 1`,
                        [parentSku]
                    ) as any[];

                    if (parentProducts.length > 0) {
                        console.log(`PARENT MATCH for ${variant.sku} -> ${parentSku}`);
                        ocPrice = parseFloat(parentProducts[0].price);
                    } else {
                        console.log(`NO MATCH for ${variant.sku} (tried ${parentSku})`);
                    }
                } else {
                    console.log(`NO MATCH for ${variant.sku}`);
                }
            }

            if (ocPrice > 0) {
                // 3. Create Price Set in Medusa
                const priceSetId = `ps_${variant.id}_${Date.now()}`;
                await medusaClient.query(
                    `INSERT INTO price_set (id, created_at, updated_at) VALUES ($1, NOW(), NOW())`,
                    [priceSetId]
                );

                // 4. Create Price in Medusa (INR)
                const priceId = `price_${variant.id}_${Date.now()}`;
                await medusaClient.query(
                    `INSERT INTO price (id, price_set_id, currency_code, amount, raw_amount, min_quantity, created_at, updated_at, rules_count) 
                 VALUES ($1, $2, 'inr', $3, $4, $5, NOW(), NOW(), 0)`,
                    [
                        priceId,
                        priceSetId,
                        parseFloat(ocPrice.toFixed(2)),
                        { value: ocPrice.toString(), precision: 20 },
                        null
                    ]
                );

                // 5. Link Price Set to Variant
                const linkId = `link_${variant.id}_${Date.now()}`;
                await medusaClient.query(
                    `INSERT INTO product_variant_price_set (id, variant_id, price_set_id, created_at, updated_at)
                 VALUES ($1, $2, $3, NOW(), NOW())`,
                    [linkId, variant.id, priceSetId]
                );

                updatedCount++;
            }
        }

        console.log(`\n\nSync Complete. Updated ${updatedCount} variants.`);

    } catch (error) {
        console.error('Sync failed:', error);
    } finally {
        await medusaClient.end();
        if (ocConnection) await ocConnection.end();
    }
}

syncPrices();
