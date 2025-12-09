import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function inspectVariant() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'product_variant';
    `);
    console.log('Columns in PRODUCT_VARIANT table:');
    res.rows.forEach(r => console.log(` - ${r.column_name}`));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

inspectVariant();
