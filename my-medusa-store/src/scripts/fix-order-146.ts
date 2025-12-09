// fix-order-146.ts
// Experiment: Change order_transaction.reference to 'capture' to see if it fixes "Refund" display

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const displayId = 146;

  console.log(`=== Fixing Order #${displayId} ===`);

  // 1. Get the transaction
  const orderRes = await pool.query(`SELECT id FROM "order" WHERE display_id = $1`, [displayId]);
  if (orderRes.rowCount === 0) return;
  const orderId = orderRes.rows[0].id;

  const txRes = await pool.query(
      `SELECT id, reference, reference_id, amount FROM order_transaction WHERE order_id = $1`,
      [orderId]
  );

  if (txRes.rowCount === 0) {
      console.log('No transaction found');
      return;
  }

  const tx = txRes.rows[0];
  console.log('Current Transaction:', tx);

  // 2. Update it
  // Current: reference = 'pay_...', reference_id = 'order_...'
  // New: reference = 'capture', reference_id = 'pay_...' (we lose razorpay order id here, but it's in metadata)
  
  if (tx.reference.startsWith('pay_')) {
      const newReference = 'capture';
      const newReferenceId = tx.reference; // Use the payment ID as the reference ID

      if (process.argv.includes('--run')) {
          await pool.query(
              `UPDATE order_transaction SET reference = $1, reference_id = $2 WHERE id = $3`,
              [newReference, newReferenceId, tx.id]
          );
          console.log(`✅ Updated transaction ${tx.id}: reference='${newReference}', reference_id='${newReferenceId}'`);
      } else {
          console.log(`[DRY RUN] Would update reference to '${newReference}' and reference_id to '${newReferenceId}'`);
          console.log(`Run with --run to apply.`);
      }
  } else {
      console.log('Transaction reference does not start with pay_, skipping.');
  }

  await pool.end();
}

main().catch(console.error);
