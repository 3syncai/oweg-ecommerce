/**
 * Extract and Update Product Prices Script
 * 
 * This script extracts product_id, price, and discount_price from OpenCart
 * and inserts/updates them in Medusa database.
 * 
 * If data already exists, it will be replaced (upsert).
 * 
 * Usage:
 *   npx ts-node src/scripts/sync-prices-advanced.ts
 */

import 'dotenv/config'; // Loads .env from CWD
import mysql from 'mysql2/promise';
import { Client } from 'pg';

// ================= CONFIG =================
const OPENCART_DB = {
    host: process.env.OPENCART_DB_HOST || '147.93.31.253',
    port: parseInt(process.env.OPENCART_DB_PORT || '3306', 10),
    user: process.env.OPENCART_DB_USER || 'oweg_user2',
    password: process.env.OPENCART_DB_PASSWORD || 'Oweg#@123',
    database: process.env.OPENCART_DB_NAME || 'oweg_db',
};

const MEDUSA_DB_URL = process.env.DATABASE_URL ||
    'postgres://postgres:Oweg4719@oweg-db4719.cdq0aquucpbq.ap-south-1.rds.amazonaws.com:5432/oweg_testing?sslmode=no-verify';

const BATCH_SIZE = 100; // Process products in batches
// ===========================================

class PriceUpdater {
    ocConnection: any = null;
    pgClient: any = null;
    salePriceListId: string | null = null;
    stats = {
        total: 0,
        updated: 0,
        created: 0,
        skipped: 0,
        errors: 0,
    };

    async connectDatabases() {
        console.log('🔌 Connecting to databases...\n');

        // Connect to OpenCart MySQL
        try {
            this.ocConnection = await mysql.createConnection(OPENCART_DB);
            console.log('✅ Connected to OpenCart MySQL database');
        } catch (error: any) {
            throw new Error(`Failed to connect to OpenCart: ${error.message}`);
        }

        // Connect to Medusa PostgreSQL
        try {
            this.pgClient = new Client({
                connectionString: MEDUSA_DB_URL,
            });
            await this.pgClient.connect();
            console.log('✅ Connected to Medusa PostgreSQL database\n');
        } catch (error: any) {
            throw new Error(`Failed to connect to Medusa: ${error.message}`);
        }
    }

    /**
     * Extract prices from OpenCart
     * Returns array of { product_id, price, discount_price }
     */
    async extractPricesFromOpenCart() {
        console.log('📦 Extracting prices from OpenCart...\n');

        const [products] = await this.ocConnection.execute(`
      SELECT 
        p.product_id,
        p.price,
        (
          SELECT ps.price
          FROM oc_product_special ps
          WHERE ps.product_id = p.product_id
            AND (ps.date_start = '0000-00-00' OR ps.date_start <= NOW())
            AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
          ORDER BY ps.priority ASC, ps.price ASC
          LIMIT 1
        ) AS discount_price
      FROM oc_product p
      WHERE p.status = 1
      ORDER BY p.product_id ASC
    `) as any[];

        console.log(`✅ Extracted ${products.length} products with prices\n`);
        return products;
    }

    /**
     * Find Medusa product by OpenCart ID
     */
    async findMedusaProductByOpenCartId(opencartId: any) {
        const result = await this.pgClient.query(`
      SELECT 
        p.id as product_id,
        pv.id as variant_id,
        pvps.price_set_id
      FROM product p
      LEFT JOIN product_variant pv ON pv.product_id = p.id AND pv.deleted_at IS NULL
      LEFT JOIN product_variant_price_set pvps ON pvps.variant_id = pv.id
      WHERE p.metadata->>'opencart_id' = $1
      LIMIT 1
    `, [String(opencartId)]);

        return result.rows[0] || null;
    }

    /**
     * Ensure 'Sale' Price List exists
     */
    async ensureSalePriceList() {
        if (this.salePriceListId) return this.salePriceListId;

        // Check if exists
        const res = await this.pgClient.query(`
      SELECT id FROM price_list WHERE title = 'Sale' LIMIT 1
    `);

        if (res.rows.length > 0) {
            this.salePriceListId = res.rows[0].id;
        } else {
            // Create it
            const newIdRes = await this.pgClient.query(`
        INSERT INTO price_list (id, title, description, type, status, created_at, updated_at)
        VALUES (gen_random_uuid()::text, 'Sale', 'Imported OpenCart Specials', 'sale', 'active', NOW(), NOW())
        RETURNING id
      `);
            this.salePriceListId = newIdRes.rows[0].id;
            console.log(`✅ Created 'Sale' Price List: ${this.salePriceListId}`);
        }
        return this.salePriceListId;
    }

    /**
     * Create or get price_set for a variant
     */
    async ensurePriceSet(variantId: any) {
        // Check if price_set already exists
        const existing = await this.pgClient.query(`
      SELECT price_set_id 
      FROM product_variant_price_set 
      WHERE variant_id = $1
      LIMIT 1
    `, [variantId]);

        if (existing.rows.length > 0) {
            return existing.rows[0].price_set_id;
        }

        // Create new price_set
        const priceSetResult = await this.pgClient.query(`
      INSERT INTO price_set (id, created_at, updated_at)
      VALUES (gen_random_uuid()::text, NOW(), NOW())
      RETURNING id
    `);
        const priceSetId = priceSetResult.rows[0].id;

        // Link variant to price_set
        await this.pgClient.query(`
      INSERT INTO product_variant_price_set (variant_id, price_set_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [variantId, priceSetId]);

        return priceSetId;
    }

    /**
     * Upsert price in Medusa
     */
    async upsertPrice(priceSetId: any, priceInCents: any, priceListId: any = null, currencyCode = 'inr') {
        // Check if price already exists
        let query = `
      SELECT id 
      FROM price 
      WHERE price_set_id = $1 
        AND currency_code = $2
        AND deleted_at IS NULL
    `;
        const params = [priceSetId, currencyCode];

        if (priceListId) {
            query += ` AND price_list_id = $3`;
            params.push(priceListId);
        } else {
            query += ` AND price_list_id IS NULL`;
        }

        const existing = await this.pgClient.query(query, params);

        if (existing.rows.length > 0) {
            const existingPriceId = existing.rows[0].id;
            // Update
            await this.pgClient.query(`
        UPDATE price 
        SET amount = $1, raw_amount = $3, updated_at = NOW()
        WHERE id = $2
      `, [priceInCents, existingPriceId, { value: priceInCents.toString(), precision: 20 }]);
            return 'updated';
        } else {
            // Create
            await this.pgClient.query(`
        INSERT INTO price (id, price_set_id, currency_code, amount, price_list_id, raw_amount, created_at, updated_at)
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW())
      `, [priceSetId, currencyCode, priceInCents, priceListId, { value: priceInCents.toString(), precision: 20 }]);
            return 'created';
        }
    }

    /**
     * Update price for a single product
     */
    async updateProductPrice(ocProduct: any) {
        const { product_id, price, discount_price } = ocProduct;

        // Parse prices
        const basePrice = parseFloat(price || "0");
        const specialPrice = discount_price ? parseFloat(discount_price) : null;

        if (basePrice <= 0) {
            this.stats.skipped++;
            return { status: 'skipped', reason: 'Base Price is zero or invalid' };
        }

        // Find Medusa product by OpenCart ID
        const medusaProduct = await this.findMedusaProductByOpenCartId(product_id);

        if (!medusaProduct || !medusaProduct.variant_id) {
            // this.stats.skipped++;
            // Silent skip for missing products to avoid clutter logs
            return { status: 'skipped', reason: 'Product not found in Medusa' };
        }

        try {
            // Ensure price_set exists
            const priceSetId = medusaProduct.price_set_id ||
                await this.ensurePriceSet(medusaProduct.variant_id);

            // 1. Update Base Price
            // Use price AS IS (no * 100 conversion)
            const baseResult = await this.upsertPrice(priceSetId, basePrice, null, 'inr');

            let specialResult = 'none';

            // 2. Update Special Price (if exists)
            if (specialPrice && specialPrice > 0 && specialPrice < basePrice) {
                const saleListId = await this.ensureSalePriceList();
                // Use price AS IS
                specialResult = await this.upsertPrice(priceSetId, specialPrice, saleListId, 'inr');
            }

            if (baseResult === 'created' || specialResult === 'created') {
                this.stats.created++;
            } else {
                this.stats.updated++;
            }

            return {
                status: 'updated',
                price: basePrice,
                specialPrice: specialPrice
            };

        } catch (error: any) {
            this.stats.errors++;
            return { status: 'error', error: error.message };
        }
    }

    /**
     * Process all products in batches
     */
    async processAllPrices() {
        const ocProducts = await this.extractPricesFromOpenCart();
        this.stats.total = ocProducts.length;

        console.log(`🔄 Processing ${ocProducts.length} products in batches of ${BATCH_SIZE}...\n`);

        for (let i = 0; i < ocProducts.length; i += BATCH_SIZE) {
            const batch = ocProducts.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(ocProducts.length / BATCH_SIZE);

            console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} products)...`);

            for (const ocProduct of batch) {
                const result = await this.updateProductPrice(ocProduct);

                // Log progress for first few and errors
                if ((i < BATCH_SIZE && i < 20) || result.status === 'error') { // Limit logs
                    const productName = `Product ID: ${ocProduct.product_id}`;
                    if (result.status === 'created' || result.status === 'updated') {
                        // console.log(`  ✅ ${result.status.toUpperCase()}: ${productName} - Base: ₹${result.price} ${result.specialPrice ? `| Special: ₹${result.specialPrice}` : ''}`);
                    } else if (result.status === 'error') {
                        console.log(`  ❌ Error: ${productName} - ${result.error}`);
                    }
                }
            }

            // Progress summary
            const processed = Math.min(i + BATCH_SIZE, ocProducts.length);
            // console.log(`  Progress: ${processed}/${ocProducts.length} (${((processed / ocProducts.length) * 100).toFixed(1)}%)\n`);
        }
    }

    /**
     * Print summary statistics
     */
    printSummary() {
        console.log('\n╔══════════════════════════════════════════════════════╗');
        console.log('║              Price Update Summary                    ║');
        console.log('╚══════════════════════════════════════════════════════╝');
        console.log(`📊 Total Products:     ${this.stats.total}`);
        console.log(`✅ Prices Created/Updated (Products): ${this.stats.created + this.stats.updated}`);
        // console.log(`⊘  Skipped:            ${this.stats.skipped}`);
        console.log(`❌ Errors:             ${this.stats.errors}`);
    }

    async closeConnections() {
        if (this.ocConnection) {
            await this.ocConnection.end();
            console.log('\n✅ Closed OpenCart connection');
        }
        if (this.pgClient) {
            await this.pgClient.end();
            console.log('✅ Closed Medusa connection');
        }
    }

    async run() {
        try {
            await this.connectDatabases();
            await this.processAllPrices();
            this.printSummary();
        } catch (error: any) {
            console.error('\n❌ Error:', error.message);
            if (error.stack) {
                console.error(error.stack);
            }
            process.exit(1);
        } finally {
            await this.closeConnections();
        }
    }
}

// Run the script
const updater = new PriceUpdater();
updater.run()
    .then(() => {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
