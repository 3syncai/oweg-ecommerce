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

async function diagnose() {
  let mysqlConnection;
  try {
    mysqlConnection = await mysql.createConnection(OPENCART_CONFIG);
    await client.connect();

    // 1. Find a product in OpenCart with a Special Price (Discount)
    const [rows] = await mysqlConnection.execute(`
      SELECT p.product_id, pd.name, p.price as mrp, ps.price as sale_price
      FROM oc_product p
      JOIN oc_product_special ps ON p.product_id = ps.product_id
      JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = 1
      WHERE ps.date_end = '0000-00-00' OR ps.date_end > NOW()
      LIMIT 1
    `);

    if ((rows as any[]).length === 0) {
        console.log("No discounted products found in OpenCart to test.");
        return;
    }
    
    const ocProduct = (rows as any[])[0];
    console.log("🔍 OpenCart Source Data:");
    console.log(ocProduct);

    // 2. Find in Medusa
    // Assume we store opencart_id in metadata
    // We need to find the PRICE set for this product.
    
    // a. Find Variant ID
    const varRes = await client.query(`
        SELECT v.id as variant_id, p.id as product_id, p.title
        FROM product p
        JOIN product_variant v ON p.id = v.product_id
        WHERE p.metadata->>'opencart_id' = $1
    `, [String(ocProduct.product_id)]);

    if (varRes.rows.length === 0) {
        console.log("❌ Product not found in Medusa.");
        return;
    }
    
    const medusaVariant = varRes.rows[0];
    console.log("\n🔍 Medusa Product Match:", medusaVariant);

    // b. Find Prices (Default + Price List)
    console.log("🔍 Fetching ALL Prices for Variant...");
    const priceRes = await client.query(`
        SELECT p.amount, p.currency_code, p.price_list_id
        FROM product_variant_price_set link
        JOIN price_set ps ON link.price_set_id = ps.id
        JOIN price p ON ps.id = p.price_set_id
        WHERE link.variant_id = $1 AND p.currency_code = 'inr'
    `, [medusaVariant.variant_id]);

    console.log(`\nRES: ID=${ocProduct.product_id}`);
    console.log(`OC_MRP=${ocProduct.mrp} OC_SALE=${ocProduct.sale_price}`);

    let defaultPrice = 0;
    let salePrice = 0;

    priceRes.rows.forEach(r => {
        const val = r.amount / 100;
        console.log(`MEDUSA: ${val} (PL:${r.price_list_id ? 'SALE' : 'DEF'})`);
        if (r.price_list_id) salePrice = val;
        else defaultPrice = val;
    });


    // Verification Logic
    let pass = true;
    if (Math.abs(ocProduct.mrp - defaultPrice) > 5) {
        console.log("❌ MRP Mismatch: Default price != OpenCart MRP");
        pass = false;
    } else {
        console.log("✅ MRP Match.");
    }

    if (Math.abs(ocProduct.sale_price - salePrice) > 5) {
        if (salePrice === 0) {
             console.log("❌ Missing Sale Price: Discount not imported?");
        } else {
             console.log("❌ Sale Price Mismatch: Imported value differs.");
        }
        pass = false;
    } else {
        console.log("✅ Sale Price Match.");
    }

    if (pass) console.log("🎉 SUCCESS: Product has correct MRP and Sale Price.");


  } catch (err) {
    console.error(err);
  } finally {
    if (mysqlConnection) await mysqlConnection.end();
    await client.end();
  }
}

diagnose();
