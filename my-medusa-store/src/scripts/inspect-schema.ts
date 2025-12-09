// src/scripts/inspect-schema.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('=== Inspecting Schema for order_transaction ===');

  const res = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'reservation_item'
    ORDER BY ordinal_position;
  `);

  console.table(res.rows);
  await pool.end();
}

main().catch(console.error);
