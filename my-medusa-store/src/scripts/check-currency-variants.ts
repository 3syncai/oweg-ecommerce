import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function checkVariants() {
  await client.connect();
  try {
    console.log("--- Checking 'inr' variants ---");
    const res = await client.query(`
      SELECT code, decimal_digits FROM currency WHERE code ILIKE 'inr%';
    `);
    console.log(res.rows);

    console.log("\n--- Checking Region Currency ---");
    const regRes = await client.query(`SELECT currency_code FROM region`);
    console.log(regRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkVariants();
