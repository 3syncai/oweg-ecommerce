import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function checkConstraints() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT column_name, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'price';
    `);
    
    console.log("Price Table Constraints:");
    res.rows.forEach(r => console.log(`${r.column_name}: ${r.is_nullable === 'NO' ? 'NOT NULL' : 'Nullable'}`));

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkConstraints();
