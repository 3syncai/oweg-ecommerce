// find-bad-tx.ts
// Find all order_transactions with reference starting with 'pay_' (should be 'capture')

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const res = await pool.query(`
      SELECT id, order_id, reference, reference_id, amount, created_at 
      FROM order_transaction 
      WHERE reference LIKE 'pay_%'
      ORDER BY created_at DESC
  `);

  console.log(`Found ${res.rowCount} transactions with 'pay_' reference:`);
  console.table(res.rows);

  await pool.end();
}

main().catch(console.error);
