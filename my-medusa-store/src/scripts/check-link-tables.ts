import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function checkTables() {
  await client.connect();
  const candidates = [
    'product_variant_price_set',
    'link_product_variant_price_set',
    'product_variant_prices',
    'pricing_product_variant',
    'price_product_variant'
  ];
  
  try {
    for (const table of candidates) {
        const res = await client.query(`
          SELECT to_regclass('public.${table}') as exists;
        `);
        console.log(`${table}: ${res.rows[0].exists ? 'EXISTS' : 'Not Found'}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkTables();
