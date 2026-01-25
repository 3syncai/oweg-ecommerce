import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function debugPrices() {
    try {
        await client.connect();

        // Check Regions first
        console.log('--- Regions ---');
        const regionRes = await client.query('SELECT id, name, currency_code FROM region');
        if (regionRes.rows.length === 0) {
            console.log('WARNING: No regions found!');
        } else {
            regionRes.rows.forEach(r => console.log(`Region: ${r.name} (${r.id}) - Currency: ${r.currency_code}`));
        }
        console.log('----------------');

        // The product ID from the screenshot
        const productId = 'prod_01KA3T1DA29TVBZXF3V09MC938';
        console.log(`Inspecting Product: ${productId}`);

        // 1. Get Variants
        const variantsRes = await client.query(
            `SELECT id, title, sku FROM product_variant WHERE product_id = $1`,
            [productId]
        );

        if (variantsRes.rows.length === 0) {
            console.log('No variants found for this product.');
            return;
        }

        console.log(`Found ${variantsRes.rows.length} variants.`);

        // 2. Check Prices for each variant using Medusa 2.0 Link Module
        for (const variant of variantsRes.rows) {
            console.log(`\nVariant: ${variant.title} (${variant.id})`);

            try {
                // Table: product_variant_price_set
                const linkRes = await client.query(
                    `SELECT price_set_id FROM product_variant_price_set WHERE variant_id = $1`,
                    [variant.id]
                );

                if (linkRes.rows.length > 0) {
                    const priceSetId = linkRes.rows[0].price_set_id;
                    console.log(`  Linked to Price Set: ${priceSetId}`);

                    // Fetch prices in this set
                    const pricesRes = await client.query(
                        `SELECT * FROM price WHERE price_set_id = $1`,
                        [priceSetId]
                    );

                    if (pricesRes.rows.length > 0) {
                        console.log(`  Prices found:`);
                        pricesRes.rows.forEach(p => {
                            console.log(`    - ID: ${p.id} | Amount: ${p.amount} | Currency: ${p.currency_code} | Rules: ${JSON.stringify(p.rules_count || 'N/A')}`);
                        });
                    } else {
                        console.log(`  !!! Price Set exists but NO price records found inside it.`);
                    }

                } else {
                    console.log(`  !!! No Price Set linked to this variant.`);
                }
            } catch (e: any) {
                console.log(`  Error checking prices: ${e.message}`);
            }
        }

    } catch (error) {
        console.error('Debug failed:', error);
    } finally {
        await client.end();
    }
}

debugPrices();
