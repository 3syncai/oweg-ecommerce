import { Client } from 'pg';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const OPENCART_CONFIG = {
  host: process.env.OPENCART_DB_HOST || "147.93.31.253",
  port: parseInt(process.env.OPENCART_DB_PORT || "3306"),
  user: process.env.OPENCART_DB_USER || "oweg_user2",
  password: process.env.OPENCART_DB_PASSWORD || "Oweg#@123",
  database: process.env.OPENCART_DB_NAME || "oweg_db",
};

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrateDiscounts() {
  let mysqlConnection;
  try {
    // 1. Connect
    mysqlConnection = await mysql.createConnection(OPENCART_CONFIG);
    await client.connect();
    console.log("🔌 Connected to both DBs.");

    // 2. Ensure 'Sale' Price List Exists
    const plHandle = 'sale-prices';
    let plId = '';
    
    const plRes = await client.query("SELECT id FROM price_list WHERE title = 'Sale Details Source'");
    
    if (plRes.rows.length > 0) {
        plId = plRes.rows[0].id;
        console.log(`✅ Found existing Sale Price List: ${plId}`);
    } else {
        const newId = `pl_${Date.now()}`;
        // v2 price_list might require specific columns. 
        // Based on inspection: id, title, description, type, status, starts_at, ends_at, rules_count
        // Assuming minimal valid insert:
        await client.query(`
            INSERT INTO price_list (id, title, description, type, status, rules_count, created_at, updated_at)
            VALUES ($1, 'Sale Details Source', 'Imported from OpenCart Special Prices', 'sale', 'active', 0, NOW(), NOW())
        `, [newId]);
        plId = newId;
        console.log(`✨ Created new Sale Price List: ${plId}`);
    }

    // 3. Fetch Special Prices from OpenCart
    const [rows] = await mysqlConnection.execute(`
      SELECT p.product_id, ps.price as sale_price
      FROM oc_product_special ps
      JOIN oc_product p ON ps.product_id = p.product_id
      WHERE (ps.date_end = '0000-00-00' OR ps.date_end > NOW())
      ORDER BY ps.priority ASC, ps.price ASC
    `);
    
    // Group to get lowest price per product if duplicates
    const discounts = new Map();
    (rows as any[]).forEach(r => {
        if (!discounts.has(r.product_id)) discounts.set(r.product_id, r.sale_price);
    });

    console.log(`📊 Found ${discounts.size} products with active discounts.`);

    // 4. Map to Medusa & Insert
    // Need Map: opencart_id -> price_set_id
    // Path: product (metadata->oc_id) -> variant -> product_variant_price_set -> price_set_id
    
    console.log("🔍 Building Medusa ID Map...");
    const mapRes = await client.query(`
        SELECT p.metadata, link.price_set_id
        FROM product p
        JOIN product_variant v ON p.id = v.product_id
        JOIN product_variant_price_set link ON v.id = link.variant_id
    `);

    const medusaMap = new Map(); // oc_id -> price_set_id
    mapRes.rows.forEach(r => {
        let meta = r.metadata;
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e){} }
        if (meta?.opencart_id) medusaMap.set(String(meta.opencart_id), r.price_set_id);
    });

    console.log("🚀 Starting Discount Import...");
    let updated = 0;

    for (const [ocId, salePrice] of discounts.entries()) {
        const priceSetId = medusaMap.get(String(ocId));
        if (!priceSetId) continue;

        const salePricePaise = Math.round(parseFloat(salePrice) * 100);

        // Check if price exists in this list already
        // We delete active one and replace, or update? Replace is safer to ensure sync.
        // Actually, let's just Upsert or Delete-Insert.
        // Delete existing for this price_set in this price_list
        await client.query(`
            DELETE FROM price 
            WHERE price_set_id = $1 AND price_list_id = $2 AND currency_code = 'inr'
        `, [priceSetId, plId]);

        if (updated === 0) {
            console.log(`🐛 Debug First Insert: price_${priceSetId}_sale_${Date.now()}, set=${priceSetId}, pl=${plId}, amount=${salePricePaise}`);
        }

        try {
            // Insert new
            const rawAmount = { value: salePricePaise.toString(), precision: 20 };
            
            await client.query(`
                INSERT INTO price (id, price_set_id, price_list_id, currency_code, amount, raw_amount, rules_count, created_at, updated_at)
                VALUES ($1, $2, $3, 'inr', $4, $5, 0, NOW(), NOW())
            `, [`price_${priceSetId}_sale_${Date.now()}`, priceSetId, plId, salePricePaise, rawAmount]);
        } catch (insertErr) {
            console.error(`❌ Error inserting price for ocId=${ocId}:`, insertErr instanceof Error ? insertErr.message : insertErr);
        }

        updated++;
        if (updated % 50 === 0) process.stdout.write('.');
    }

    console.log(`\n🎉 SUCCESS: Imported ${updated} discounts into Price List.`);

  } catch (err) {
    console.error(err);
  } finally {
    if (mysqlConnection) await mysqlConnection.end();
    await client.end();
  }
}

migrateDiscounts();
