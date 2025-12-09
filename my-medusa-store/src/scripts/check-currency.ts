import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function checkCurrency() {
  await client.connect();
  try {
    const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'currency'`);
    console.log("Currency Columns:", cols.rows.map(r => r.column_name));
    
    const res = await client.query(`
      SELECT decimal_digits FROM currency WHERE code = 'inr';
    `);
    console.log("INR decimal_digits:", res.rows[0].decimal_digits);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkCurrency();
