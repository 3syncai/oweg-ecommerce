// debug-order-141.ts
// Diagnostic script to investigate the source of the "Refund" line for order #141 in Medusa Admin.

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const displayId = 141;

  // Fetch order
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
  console.log('=== Order ===');
  console.table([order]);

  // Order summary (totals is a JSON column)
  const summaryRes = await pool.query(
    `SELECT totals
     FROM order_summary
     WHERE order_id = $1`,
    [order.id]
  );
  console.log('\n=== Order Summary (totals JSON) ===');
  if (summaryRes.rows.length > 0) {
    console.log(JSON.stringify(summaryRes.rows[0].totals, null, 2));
  } else {
    console.log('⚠️ No order_summary found for this order');
  }

  // Payment collections (remove non-existent currency column)
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

  // Payments and refunds
  for (const pc of pcRes.rows) {
    const payRes = await pool.query(
      `SELECT id, amount, captured_amount, refunded_amount, status, created_at
       FROM payment
       WHERE payment_collection_id = $1`,
      [pc.id]
    );
    console.log(`\n--- Payments for PC ${pc.id} ---`);
    console.table(payRes.rows);
    for (const pay of payRes.rows) {
      const refundRes = await pool.query(
        `SELECT id, amount, reason, created_at
         FROM refund
         WHERE payment_id = $1`,
        [pay.id]
      );
      if (refundRes.rowCount > 0) {
        console.log(`Refunds for payment ${pay.id}:`);
        console.table(refundRes.rows);
      }
    }
  }

  // Order transactions
  const otRes = await pool.query(
    `SELECT id, reference, reference_id, amount, created_at
     FROM order_transaction
     WHERE order_id = $1
     ORDER BY created_at ASC`,
    [order.id]
  );
  console.log('\n=== Order Transactions ===');
  console.table(otRes.rows);

  // Also check if there's a different order with same display_id
  const allOrdersRes = await pool.query(
    `SELECT id, display_id, status, is_draft_order, currency_code, created_at
     FROM "order"
     WHERE display_id = $1`,
    [displayId]
  );
  console.log('\n=== All orders with display_id = 141 ===');
  console.table(allOrdersRes.rows);

  await pool.end();
}

main().catch(err => {
  console.error('Error:', err);
});
