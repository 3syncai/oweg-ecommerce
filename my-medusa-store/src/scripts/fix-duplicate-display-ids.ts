// fix-duplicate-display-ids.ts
// Reassign display_ids to old migrated orders to avoid conflicts with new orders
//
// Strategy: For each duplicate display_id, the OLD order (from 2023) will get a new
// display_id starting from 10000 to clearly separate migrated orders.

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const DRY_RUN = true; // Set to false to apply changes

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('=== Fix Duplicate Display IDs ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  // Find duplicates
  const duplicatesRes = await pool.query(`
    SELECT display_id, COUNT(*) as count
    FROM "order"
    GROUP BY display_id
    HAVING COUNT(*) > 1
    ORDER BY display_id ASC
  `);

  console.log(`Found ${duplicatesRes.rows.length} display_ids with duplicates\n`);

  // Get the current max display_id to start new IDs from there
  const maxRes = await pool.query(`SELECT MAX(display_id) as max_id FROM "order"`);
  let nextId = Math.max(10000, (maxRes.rows[0].max_id || 0) + 1);

  let updated = 0;
  let skipped = 0;

  for (const dup of duplicatesRes.rows) {
    // Get all orders with this display_id, ordered by created_at (oldest first)
    const ordersRes = await pool.query(`
      SELECT id, display_id, created_at
      FROM "order"
      WHERE display_id = $1
      ORDER BY created_at ASC
    `, [dup.display_id]);

    // The OLDEST order is the migrated one - reassign its display_id
    // Keep the NEWEST order with the original display_id
    for (let i = 0; i < ordersRes.rows.length - 1; i++) {
      const oldOrder = ordersRes.rows[i];
      const newDisplayId = nextId++;

      console.log(`  Order ${oldOrder.id}:`);
      console.log(`    Old display_id: ${oldOrder.display_id}`);
      console.log(`    New display_id: ${newDisplayId}`);
      console.log(`    Created: ${oldOrder.created_at}`);

      if (!DRY_RUN) {
        await pool.query(
          `UPDATE "order" SET display_id = $1 WHERE id = $2`,
          [newDisplayId, oldOrder.id]
        );
        console.log(`    ✅ Updated`);
      } else {
        console.log(`    [DRY RUN] Would update`);
      }
      updated++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Duplicates found: ${duplicatesRes.rows.length}`);
  console.log(`  Orders updated: ${updated}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);

  if (DRY_RUN && updated > 0) {
    console.log(`\n💡 Run with DRY_RUN = false to apply changes`);
  }

  await pool.end();
}

main().catch(err => console.error('Error:', err));
