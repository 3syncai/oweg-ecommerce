import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'order'
    ORDER BY ordinal_position;
  `);
  console.log('Order table columns:');
  console.table(res.rows);
  await pool.end();
}

main().catch(err => console.error(err));
