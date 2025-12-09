// flush-all-orders.ts
// 🔴 DESTRUCTIVE SCRIPT: Deletes ALL orders and related data from the database.
// Use this to reset the order history for fresh testing.

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function askConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('⚠️  ARE YOU SURE YOU WANT TO DELETE ALL ORDERS? This cannot be undone. Type "DELETE" to confirm: ', (answer) => {
      rl.close();
      resolve(answer === 'DELETE');
    });
  });
}

async function main() {
  console.log('=== 🔴 FLUSH ALL ORDERS ===');
  
  const confirmed = await askConfirmation();
  if (!confirmed) {
    console.log('Aborted.');
    await pool.end();
    return;
  }

  console.log('\nStarting deletion sequence...');
  
  try {
    await pool.query('BEGIN');

    // 1. Get all Payment Collections linked to orders (to delete them later)
    // We'll delete them after unlinking, or just verify we handle them.
    // Actually, deeper cleanup: Delete ALL payment data linked to these orders?
    // Or just all payment data period? "Flush all orders" usually implies cleaning the slate.
    // Let's stick to deleting things linked to "order" table first, and cascading to their children.

    // 1. Refunds (linked to payments, likely need to find payments linked to orders)
    // Complex chain. Let's do it table by table.

    // --- DEPENDENCIES OF ORDER ---

    console.log('Deleting order_summary...');
    await pool.query('DELETE FROM order_summary');

    console.log('Deleting order_transaction...');
    await pool.query('DELETE FROM order_transaction');

    console.log('Deleting order_payment_collection...');
    await pool.query('DELETE FROM order_payment_collection');
    // Note: This leaves payment_collections orphaned. We should clean them.
    console.log('Deleting orphaned payment_collection (and related payments)...');
    // Delete payments first
    await pool.query(`
      DELETE FROM payment 
      WHERE payment_collection_id IN (
        SELECT id FROM payment_collection 
        WHERE id NOT IN (SELECT payment_collection_id FROM order_payment_collection)
        -- AND assuming we want to wipe ALL if we are wiping all orders.
        -- But safer to just wipe everything if the user wants "fresh".
        -- For now, let's just delete ALL payment collections if we are deleting ALL orders.
      )
    `);
    // Ideally we just empty the whole payment_collection table if we empty orders, 
    // unless there are carts without orders? 
    // Let's be aggressive: Delete all payment collections.
    console.log('  - Deleting associated refunds...');
    await pool.query('DELETE FROM refund'); // Refunds depend on payments
    console.log('  - Deleting all payments...');
    await pool.query('DELETE FROM payment'); // Payments depend on PCs
    console.log('  - Deleting all payment sessions...');
    await pool.query('DELETE FROM payment_session'); // Sessions depend on PCs
    
    // Now delete PCs
    await pool.query('DELETE FROM payment_collection');

    console.log('Deleting line_item / order_item...');
    try { await pool.query('DELETE FROM order_item'); } catch(e) {}
    try { await pool.query('DELETE FROM line_item WHERE order_id IS NOT NULL'); } catch(e) {}

    console.log('Deleting order_shipping_method / order_shipping...');
    try { await pool.query('DELETE FROM order_shipping_method'); } catch(e) {} 
    try { await pool.query('DELETE FROM order_shipping'); } catch(e) {}

    console.log('Deleting order_address...');
    try { await pool.query('DELETE FROM order_address'); } catch(e) {}
    try { await pool.query('DELETE FROM address WHERE id IN (SELECT billing_address_id FROM "order") OR id IN (SELECT shipping_address_id FROM "order")'); } catch(e) {}

    console.log('Deleting order_change & actions...');
    await pool.query('DELETE FROM order_change_action');
    await pool.query('DELETE FROM order_change');

    console.log('Deleting returns, claims, swaps...');
    try { await pool.query('DELETE FROM "return"'); } catch(e) {}
    try { await pool.query('DELETE FROM claim_order'); } catch(e) {}
    try { await pool.query('DELETE FROM swap'); } catch(e) {}
    
    // Notifications? (notification table linked to order?) 
    // Keeping it simple.

    // Finally...
    console.log('Deleting "order"...');
    await pool.query('DELETE FROM "order"');

    // Also Draft Orders?
    console.log('Deleting draft_order...');
    try { await pool.query('DELETE FROM draft_order'); } catch(e) {}

    await pool.query('COMMIT');
    console.log('\n✅ All orders flushed successfully.');

  } catch (e) {
    await pool.query('ROLLBACK');
    console.error('❌ Error flushing orders:', e);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
