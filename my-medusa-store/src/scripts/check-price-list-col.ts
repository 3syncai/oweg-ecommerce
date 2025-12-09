import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function checkPriceListId() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'price' 
      AND column_name = 'price_list_id';
    `);
    
    if (res.rows.length > 0) {
        console.log("✅ price_list_id column EXISTS in price table.");
    } else {
        console.log("❌ price_list_id column MISSING in price table.");
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkPriceListId();
