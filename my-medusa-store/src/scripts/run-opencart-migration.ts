import { Client } from 'pg';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// OpenCart (Source) Config
const OPENCART_CONFIG = {
  host: process.env.OPENCART_DB_HOST || "147.93.31.253",
  port: parseInt(process.env.OPENCART_DB_PORT || "3306"),
  user: process.env.OPENCART_DB_USER || "oweg_user2",
  password: process.env.OPENCART_DB_PASSWORD || "Oweg#@123",
  database: process.env.OPENCART_DB_NAME || "oweg_db",
};

// Medusa (Destination) Config
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  let mysqlConnection: mysql.Connection | null = null;
  try {
    // 1. Connect to both DBs
    console.log("📡 Connecting to OpenCart MySQL...");
    mysqlConnection = await mysql.createConnection(OPENCART_CONFIG);
    console.log("✅ MySQL Connected.");
    
    await client.connect();
    console.log("✅ Postgres Connected.");

    // 2. Fetch Source Prices
    // Logic adapted from migrate-opencart-prices.ts
    const [rows] = await mysqlConnection.execute(`
    SELECT DISTINCT
      p.product_id, 
      pd.name,
      p.price as base_price, -- This is '449.00' (Major)
      (SELECT ps.price 
       FROM oc_product_special ps 
       WHERE ps.product_id = p.product_id 
         AND ((ps.date_start = '0000-00-00' OR ps.date_start < NOW()) 
         AND (ps.date_end = '0000-00-00' OR ps.date_end > NOW())) 
       ORDER BY ps.priority ASC, ps.price ASC 
       LIMIT 1) as special_price
    FROM oc_product p
    LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = 1
    WHERE p.price > 0
    `);

    const products = rows as any[];
    console.log(`📊 Found ${products.length} products in OpenCart.`);

    // 3. Map and Update
    console.log("🚀 Starting update...");
    let updatedCount = 0;
    
    // Cache Medusa Products to find IDs
    // We need map: opencart_id -> medusa_variant_id
    // Querying medusa 'product' table directly to find mismatch in IDs is fast.
    // Assuming 'metadata->>opencart_id' exists.
    
    const medusaRes = await client.query(`
        SELECT p.id as product_id, v.id as variant_id, p.metadata 
        FROM product p
        JOIN product_variant v ON p.id = v.product_id
    `);
    
    const medusaMap = new Map(); // opencart_id string -> variant_id
    medusaRes.rows.forEach(r => {
        // Handle metadata whether it is string or object
        let meta = r.metadata;
        if (typeof meta === 'string') {
            try { meta = JSON.parse(meta); } catch (e) {}
        }
        
        const ocId = meta?.opencart_id;
        if (ocId) medusaMap.set(String(ocId), r.variant_id);
    });

    for (const p of products) {
        const variantId = medusaMap.get(String(p.product_id));
        if (!variantId) continue;

        const basePrice = parseFloat(p.base_price);
        // STANDARDIZATION: Convert Major to Minor (Paise)
        const amountPaise = Math.round(basePrice * 100);

        try {
            // RESOLVE PRICE_SET_ID
            const linkRes = await client.query(`
                SELECT price_set_id 
                FROM product_variant_price_set 
                WHERE variant_id = $1
            `, [variantId]);

            let priceSetId = linkRes.rows[0]?.price_set_id;

            if (!priceSetId) {
                // Determine if we need to create a price_set (complex). 
                // For now, let's assume if it doesn't exist, we skip or log error.
                // In a migration scenario, usually price sets should exist if variants exist.
                // If not, we might fail.
                console.warn(`⚠️ No price_set_id found for variant ${variantId}. Skipping.`);
                continue;
            }

            // UPDATE PRICE USING PRICE_SET_ID
            const updateRes = await client.query(`
                UPDATE price 
                SET amount = $1 
                WHERE price_set_id = $2 AND currency_code = 'inr'
            `, [amountPaise, priceSetId]);

            if (updateRes.rowCount === 0) {
                 // Insert if not exists (Requires creating a new price ID)
                 // And linking to price_set_id
                 await client.query(`
                    INSERT INTO price (id, price_set_id, currency_code, amount, rules_count)
                    VALUES ($1, $2, 'inr', $3, 0)
                `, [`price_${variantId}_inr_${Date.now()}`, priceSetId, amountPaise]);
            }
        } catch (updateErr) {
            console.error(`❌ Error updating variant ${variantId}:`, updateErr instanceof Error ? updateErr.message : updateErr);
        }
        
        updatedCount++;
        if (updatedCount % 50 === 0) process.stdout.write('.');
    }

    console.log(`\n🎉 SUCCESS: Synced ${updatedCount} prices from OpenCart to Medusa (Paise).`);

  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    if (mysqlConnection) await mysqlConnection.end();
    await client.end();
  }
}

runMigration();
