import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function checkStoreCurrencies() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT * FROM store_currency
    `);
    console.log("Store Currencies:", res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkStoreCurrencies();
