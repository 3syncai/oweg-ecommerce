import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function checkRegionTax() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT id, name, currency_code, automatic_taxes, gift_cards_taxable FROM region
    `);
    console.log("Regions:", res.rows);
    
    // Check if there is an 'includes_tax' column (common in v1, maybe moved to tax_rate in v2?)
    const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'region'`);
    console.log("Region Columns:", cols.rows.map(r => r.column_name));

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkRegionTax();
