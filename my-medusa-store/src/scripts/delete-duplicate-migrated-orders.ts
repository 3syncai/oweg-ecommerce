// delete-duplicate-migrated-orders.ts
// Delete old migrated orders (2023) that have duplicate display_ids with new Razorpay orders
//
// These old orders have NO useful data:
// - No order_summary
// - No payment_collection  
// - No order_transaction
// - No payment data

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const DRY_RUN = false; // Set to false to actually delete

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('=== Delete Duplicate Migrated Orders ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : '🔴 LIVE - WILL DELETE'}\n`);

  // Find duplicates
  const duplicatesRes = await pool.query(`
    SELECT display_id, COUNT(*) as count
    FROM "order"
    GROUP BY display_id
    HAVING COUNT(*) > 1
    ORDER BY display_id ASC
  `);

  console.log(`Found ${duplicatesRes.rows.length} display_ids with duplicates\n`);

  const ordersToDelete: { id: string; display_id: number; created_at: Date }[] = [];

  for (const dup of duplicatesRes.rows) {
    // Get all orders with this display_id, ordered by created_at (oldest first)
    const ordersRes = await pool.query(`
      SELECT id, display_id, created_at
      FROM "order"
      WHERE display_id = $1
      ORDER BY created_at ASC
    `, [dup.display_id]);

    // All orders EXCEPT the newest one will be deleted
    for (let i = 0; i < ordersRes.rows.length - 1; i++) {
      ordersToDelete.push(ordersRes.rows[i]);
    }
  }

  console.log(`Orders to delete: ${ordersToDelete.length}\n`);

  let deleted = 0;
  let errors = 0;

  for (const order of ordersToDelete) {
    console.log(`  Order ${order.id}:`);
    console.log(`    display_id: ${order.display_id}`);
    console.log(`    created_at: ${order.created_at}`);

    if (!DRY_RUN) {
      try {
        // Delete in order to avoid FK constraints:
        // 1. Payment Collections (delete PC itself first, then the link)
        // Find PCs first
        const pcs = await pool.query(`SELECT payment_collection_id FROM order_payment_collection WHERE order_id = $1`, [order.id]);
        const pcIds = pcs.rows.map(r => r.payment_collection_id);
        
        // Delete link
        await pool.query(`DELETE FROM order_payment_collection WHERE order_id = $1`, [order.id]);
        
        // Delete actual PCs
        if (pcIds.length > 0) {
            for (const pcId of pcIds) {
                await pool.query(`DELETE FROM payment_collection WHERE id = $1`, [pcId]);
            }
        }
        
        // 2. Delete order_transaction
        await pool.query(`DELETE FROM order_transaction WHERE order_id = $1`, [order.id]);
        
        // 3. Delete order_summary
        await pool.query(`DELETE FROM order_summary WHERE order_id = $1`, [order.id]);
        
        // 4. Delete order_change related
        await pool.query(`DELETE FROM order_change_action WHERE order_change_id IN (SELECT id FROM order_change WHERE order_id = $1)`, [order.id]);
        await pool.query(`DELETE FROM order_change WHERE order_id = $1`, [order.id]);
        
        // 5. Delete order_item
        try {
            await pool.query(`DELETE FROM order_item WHERE order_id = $1`, [order.id]);
        } catch (e) { /* ignore */ }
        
        // 6. Delete order_shipping
        try {
            await pool.query(`DELETE FROM order_shipping WHERE order_id = $1`, [order.id]);
        } catch (e) { /* ignore */ }
        
        // 7. Delete order_address
        try {
            await pool.query(`DELETE FROM order_address WHERE order_id = $1`, [order.id]);
        } catch (e) { /* ignore */ }
        
        // 8. Finally delete the order
        await pool.query(`DELETE FROM "order" WHERE id = $1`, [order.id]);
        
        console.log(`    ✅ Deleted`);
        deleted++;
      } catch (err: any) {
        console.log(`    ❌ Error: ${err.message}`);
        errors++;
      }
    } else {
      console.log(`    [DRY RUN] Would delete`);
      deleted++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Duplicates found: ${duplicatesRes.rows.length}`);
  console.log(`  Orders deleted: ${deleted}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);

  if (DRY_RUN && deleted > 0) {
    console.log(`\n💡 Run with DRY_RUN = false to actually delete`);
  }

  await pool.end();
}

main().catch(err => console.error('Error:', err));
