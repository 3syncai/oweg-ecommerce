// debug-order-146.ts
// Diagnostic script for new order #146 (which shows a ghost refund)

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const displayId = 146;

  console.log(`=== Debugging Order #${displayId} ===\n`);

  // 1. Fetch order
  const orderRes = await pool.query(
    `SELECT id, display_id, status, is_draft_order, currency_code, created_at
     FROM "order"
     WHERE display_id = $1`,
    [displayId]
  );
  
  if (orderRes.rowCount === 0) {
    console.log('Order not found');
    await pool.end();
    return;
  }
  
  const order = orderRes.rows[0];
  console.log('=== Order Details ===');
  console.table([order]);

  // 2. Fetch Order Summary
  const summaryRes = await pool.query(
    `SELECT totals FROM order_summary WHERE order_id = $1`,
    [order.id]
  );
  console.log('\n=== Order Summary (totals JSON) ===');
  if (summaryRes.rows.length > 0) {
    console.log(JSON.stringify(summaryRes.rows[0].totals, null, 2));
  } else {
    console.log('No order_summary found');
  }

  // 3. Payment Collections
  const pcRes = await pool.query(
    `SELECT pc.id, pc.status, pc.amount, pc.captured_amount, pc.refunded_amount, pc.created_at
     FROM payment_collection pc
     JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
     WHERE opc.order_id = $1
     ORDER BY pc.created_at ASC`,
    [order.id]
  );
  console.log('\n=== Payment Collections ===');
  console.table(pcRes.rows);

  // 4. Payments & Refunds
  for (const pc of pcRes.rows) {
    const payRes = await pool.query(
      `SELECT id, amount, created_at
       FROM payment WHERE payment_collection_id = $1`,
      [pc.id]
    );
    console.log(`\n--- Payments for PC ${pc.id} ---`);
    console.table(payRes.rows);

    for (const pay of payRes.rows) {
      // Check Payment Refund table
      const refundRes = await pool.query(
        `SELECT id, amount, created_at FROM refund WHERE payment_id = $1`,
        [pay.id]
      );
      if (refundRes.rowCount > 0) {
        console.log(`❌ ACTUAL REFUNDS FOUND for payment ${pay.id}:`);
        console.table(refundRes.rows);
      } else {
        console.log(`✅ No entries in 'refund' table for payment ${pay.id}`);
      }
    }
  }

  // 5. Order Transactions
  const otRes = await pool.query(
    `SELECT id, reference, reference_id, amount, created_at
     FROM order_transaction
     WHERE order_id = $1
     ORDER BY created_at ASC`,
    [order.id]
  );
  console.log('\n=== Order Transactions ===');
  console.table(otRes.rows);

  // 6. Check for duplicate orders again
  const duplicates = await pool.query(
    `SELECT id, display_id FROM "order" WHERE display_id = $1`, 
    [displayId]
  );
  if (duplicates.rowCount > 1) {
    console.log(`\n❌ WARNING: ${duplicates.rowCount} orders found with display_id ${displayId}`);
    console.table(duplicates.rows);
  } else {
      console.log(`\n✅ No duplicate display_ids found`);
  }

  // 7. Check Secondary Tables (Safely)
  console.log('\n=== Secondary Tables ===');
  
  try {
      const returnRes = await pool.query(`SELECT id, status, refund_amount FROM "return" WHERE order_id = $1`, [order.id]);
      if (returnRes.rowCount > 0) {
          console.log('Returns found:');
          console.table(returnRes.rows);
      } else { console.log('✅ No returns'); }
  } catch (e) {
      console.log('Skipping return table check (not found)');
  }

  // 8. Order Changes (Safely)
  try {
      const changeRes = await pool.query(`SELECT id, change_type, status, created_at FROM order_change WHERE order_id = $1`, [order.id]);
      if (changeRes.rowCount > 0) {
          console.log('Order Changes found:');
          console.table(changeRes.rows);
          
          for (const change of changeRes.rows) {
              const actionRes = await pool.query(`SELECT id, action, details, reference, reference_id, amount FROM order_change_action WHERE order_change_id = $1`, [change.id]);
              console.table(actionRes.rows);
          }
      } else { console.log('✅ No order changes'); }
  } catch (e) {
      console.log('Skipping order_change table check');
  }

  // 9. Payment Data
  console.log('\n=== Payment Data ===');
  const payDataRes = await pool.query(`
      SELECT p.id, p.data, p.amount, p.currency_code 
      FROM payment p
      JOIN payment_collection pc ON p.payment_collection_id = pc.id
      JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
      WHERE opc.order_id = $1
  `, [order.id]);
  
  for (const p of payDataRes.rows) {
      console.log(`Payment ${p.id}:`);
      console.log(`  Amount: ${p.amount} ${p.currency_code}`);
      console.log(`  Data:`);
      console.log(JSON.stringify(p.data, null, 2));
  }

  await pool.end();
}

main().catch(err => console.error(err));
