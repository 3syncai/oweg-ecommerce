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

async function syncStatus() {
  let mysqlConnection;
  try {
    // 1. Connect
    mysqlConnection = await mysql.createConnection(OPENCART_CONFIG);
    await client.connect();
    console.log("🔌 Connected to both DBs.");

    // 2. Fetch all statuses from OpenCart
    const [rows] = await mysqlConnection.execute(`
      SELECT product_id, status FROM oc_product
    `);
    const products = rows as any[];
    console.log(`📊 Found ${products.length} products in OpenCart.`);

    // 3. Map OC ID to Medusa ID
    console.log("🔍 Building Medusa ID Map...");
    const mapRes = await client.query(`
        SELECT id, metadata FROM product
    `);
    
    const medusaMap = new Map(); // oc_id -> medusa_id
    mapRes.rows.forEach(r => {
        let meta = r.metadata;
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e){} }
        if (meta?.opencart_id) medusaMap.set(String(meta.opencart_id), r.id);
    });

    // 4. Update Statuses
    console.log("🚀 Syncing statuses...");
    let published = 0;
    let drafted = 0;
    let updated = 0;

    for (const p of products) {
        const medusaId = medusaMap.get(String(p.product_id));
        if (!medusaId) continue;

        const newStatus = p.status === 1 ? 'published' : 'draft';
        
        await client.query(`
            UPDATE product 
            SET status = $1 
            WHERE id = $2
        `, [newStatus, medusaId]);

        if (newStatus === 'published') published++;
        else drafted++;
        
        updated++;
        if (updated % 100 === 0) process.stdout.write('.');
    }

    console.log(`\n🎉 SUCCESS: Synced ${updated} product statuses.`);
    console.log(`✅ Set to PUBLISHED: ${published}`);
    console.log(`📝 Set to DRAFT: ${drafted}`);

  } catch (err) {
    console.error(err);
  } finally {
    if (mysqlConnection) await mysqlConnection.end();
    await client.end();
  }
}

syncStatus();
