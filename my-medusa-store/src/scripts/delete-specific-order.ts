// delete-specific-order.ts
// Deletes a specific order by ID to resolve duplicate display_id issues

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const orderId = 'fd442ffd-12b1-4167-8578-6c6dcf789403'; // The old 2023 order
  const displayId = 148;

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log(`=== Deleting Order ID: ${orderId} (Display #${displayId}) ===`);

  try {
    // 1. Check if it exists
    const check = await pool.query(`SELECT id FROM "order" WHERE id = $1`, [orderId]);
    if (check.rowCount === 0) {
      console.log('Order not found, nothing to delete.');
      await pool.end();
      return;
    }

    // 2. Begin transaction
    await pool.query('BEGIN');

    // 3. Delete related records (reverse dependency order)
    
    // Order Summary
    await pool.query(`DELETE FROM order_summary WHERE order_id = $1`, [orderId]);
    console.log('Deleted order_summary');

    // Order Transactions
    await pool.query(`DELETE FROM order_transaction WHERE order_id = $1`, [orderId]);
    console.log('Deleted order_transaction');

    // Payment Collections (delete PC itself first, then the link)
    // Find PCs first
    const pcs = await pool.query(`SELECT payment_collection_id FROM order_payment_collection WHERE order_id = $1`, [orderId]);
    const pcIds = pcs.rows.map(r => r.payment_collection_id);
    
    // Delete link
    await pool.query(`DELETE FROM order_payment_collection WHERE order_id = $1`, [orderId]);
    console.log('Deleted order_payment_collection');

    // Delete actual PCs
    if (pcIds.length > 0) {
        // Safe to delete PCs now they are unlinked from this order.
        // Assuming they aren't shared (Medusa usually 1:1 or 1:N but PC belongs to cart/order)
        for (const pcId of pcIds) {
            await pool.query(`DELETE FROM payment_collection WHERE id = $1`, [pcId]);
        }
        console.log(`Deleted ${pcIds.length} payment_collection(s)`);
    }

    // Order Items (correct table name)
    try {
        await pool.query(`DELETE FROM order_item WHERE order_id = $1`, [orderId]);
        console.log('Deleted order_item');
    } catch (e) { console.log('Skipping order_item (table may differ)'); }

    // Line Items (just in case)
    try {
        await pool.query(`DELETE FROM line_item WHERE order_id = $1`, [orderId]);
        console.log('Deleted line_item');
    } catch (e) { /* ignore */ }
    
    // Order Shipping
    try {
        await pool.query(`DELETE FROM order_shipping WHERE order_id = $1`, [orderId]);
        console.log('Deleted order_shipping');
    } catch (e) { /* ignore */ }

    // Order Address
    try {
        await pool.query(`DELETE FROM order_address WHERE order_id = $1`, [orderId]);
        console.log('Deleted order_address');
    } catch (e) { 
        console.log('Skipping order_address (order_id col missing or table missing)');
    }
    
    // Order Change/Events (if any)
    const changes = await pool.query(`SELECT id FROM order_change WHERE order_id = $1`, [orderId]);
    for (const ch of changes.rows) {
        await pool.query(`DELETE FROM order_change_action WHERE order_change_id = $1`, [ch.id]);
    }
    await pool.query(`DELETE FROM order_change WHERE order_id = $1`, [orderId]);
    console.log('Deleted order_change');

    // Finally, the Order
    await pool.query(`DELETE FROM "order" WHERE id = $1`, [orderId]);
    console.log('Deleted "order"');

    await pool.query('COMMIT');
    console.log(`\n✅ Successfully deleted order ${orderId}`);

  } catch (e) {
    await pool.query('ROLLBACK');
    console.error('❌ Error deleting order:', e);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
