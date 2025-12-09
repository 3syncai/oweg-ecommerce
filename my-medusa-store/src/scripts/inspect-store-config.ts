import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function checkStore() {
  await client.connect();
  try {
    console.log("--- Store Config ---");
    const store = await client.query('SELECT * FROM store');
    console.log(store.rows[0]);

    console.log("\n--- Region Config ---");
    const regions = await client.query('SELECT id, name, currency_code, tax_rate, tax_code, automatic_taxes FROM region');
    console.log(regions.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkStore();
