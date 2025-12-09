// fix-order-reference-test.ts
// Experiment: Change order_transaction.reference from 'capture' to 'payment' 
// to see if "Refund" label changes to "Payment" or "Capture".

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const displayId = 149;
  const newReference = 'payment'; // Trying 'payment' instead of 'capture'

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log(`=== Updating Order #${displayId} Transaction Reference ===`);

  // 1. Find transaction
  const txRes = await pool.query(`
    SELECT ot.id, ot.reference, ot.reference_id 
    FROM order_transaction ot
    JOIN "order" o ON ot.order_id = o.id
    WHERE o.display_id = $1
  `, [displayId]);

  if (txRes.rowCount === 0) {
    console.log('No transaction found.');
    await pool.end();
    return;
  }

  const tx = txRes.rows[0];
  console.log('Current Transaction:', tx);

  // 2. Update it
  await pool.query(
    `UPDATE order_transaction SET reference = $1 WHERE id = $2`,
    [newReference, tx.id]
  );
  
  console.log(`✅ Updated reference to '${newReference}'`);

  await pool.end();
}

main().catch(console.error);
