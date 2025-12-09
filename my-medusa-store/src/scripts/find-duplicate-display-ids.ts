// find-duplicate-display-ids.ts
// Find all orders that share the same display_id (duplicates)

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('=== Finding duplicate display_ids ===\n');

  const duplicatesRes = await pool.query(`
    SELECT display_id, COUNT(*) as count
    FROM "order"
    GROUP BY display_id
    HAVING COUNT(*) > 1
    ORDER BY display_id DESC
  `);

  console.log(`Found ${duplicatesRes.rows.length} display_ids with duplicates:\n`);
  console.table(duplicatesRes.rows);

  // For each duplicate, show the orders
  for (const dup of duplicatesRes.rows) {
    console.log(`\n=== Orders with display_id = ${dup.display_id} ===`);
    const ordersRes = await pool.query(`
      SELECT id, display_id, status, is_draft_order, currency_code, created_at
      FROM "order"
      WHERE display_id = $1
      ORDER BY created_at ASC
    `, [dup.display_id]);
    console.table(ordersRes.rows);
  }

  await pool.end();
}

main().catch(err => console.error('Error:', err));
