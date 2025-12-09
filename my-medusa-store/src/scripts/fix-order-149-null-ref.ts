// fix-order-149-null-ref.ts
// Test: Set reference to NULL and currency to 'INR' (uppercase) for Order #149
// Hypothesis: 'capture' string or lowercase currency might trigger "Refund" display.

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const displayId = 149; // The order to test
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log(`=== Updating Order #${displayId} Transaction (NULL ref, INR currency) ===`);

  // 1. Find transaction
  const txRes = await pool.query(`
    SELECT ot.id, ot.reference, ot.reference_id, ot.currency_code
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
    `UPDATE order_transaction 
     SET reference = NULL, 
         currency_code = 'INR' 
     WHERE id = $1`,
    [tx.id]
  );
  
  console.log(`✅ Updated reference to NULL and currency_code to 'INR'`);

  await pool.end();
}

main().catch(console.error);
