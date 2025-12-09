import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function inspectPrice() {
  await client.connect();
  try {
    const resPrice = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'price';
    `);
    console.log('Columns in PRICE table:');
    resPrice.rows.forEach(r => console.log(` - ${r.column_name} (${r.data_type})`));

    const resPriceSet = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'price_set';
    `);
    console.log('\nColumns in PRICE_SET table:');
    resPriceSet.rows.forEach(r => console.log(` - ${r.column_name} (${r.data_type})`));

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

inspectPrice();
