// debug-order-141-new.ts
// Check the NEW order with display_id=141

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // The NEW order ID
  const orderId = 'order_01KC1CNBZGB6WC1W12S2C6W4XY';

  console.log(`=== Checking order: ${orderId} ===\n`);

  // Order summary
  const summaryRes = await pool.query(
    `SELECT totals FROM order_summary WHERE order_id = $1`,
    [orderId]
  );
  console.log('=== Order Summary ===');
  if (summaryRes.rows.length > 0) {
    console.log(JSON.stringify(summaryRes.rows[0].totals, null, 2));
  } else {
    console.log('No order_summary');
  }

  // Payment collections
  const pcRes = await pool.query(
    `SELECT pc.id, pc.status, pc.amount, pc.captured_amount, pc.refunded_amount, pc.created_at
     FROM payment_collection pc
     JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
     WHERE opc.order_id = $1
     ORDER BY pc.created_at ASC`,
    [orderId]
  );
  console.log('\n=== Payment Collections ===');
  console.table(pcRes.rows);

  // Payments
  for (const pc of pcRes.rows) {
    const payRes = await pool.query(
      `SELECT id, amount, captured_amount, refunded_amount, status, created_at
       FROM payment WHERE payment_collection_id = $1`,
      [pc.id]
    );
    console.log(`\n--- Payments for PC ${pc.id} ---`);
    console.table(payRes.rows);
  }

  // Order transactions
  const otRes = await pool.query(
    `SELECT id, reference, reference_id, amount, created_at
     FROM order_transaction WHERE order_id = $1
     ORDER BY created_at ASC`,
    [orderId]
  );
  console.log('\n=== Order Transactions ===');
  console.table(otRes.rows);

  await pool.end();
}

main().catch(err => console.error('Error:', err));
