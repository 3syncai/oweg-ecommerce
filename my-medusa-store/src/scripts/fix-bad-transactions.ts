// fix-bad-transactions.ts
// Fix all order_transactions with reference starting with 'pay_' (should be 'capture')
// This fixes the "Refund" display issue in Medusa Admin

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const DRY_RUN = false; // Set to false to apply changes

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('=== Fix Bad Transactions ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : '🔴 LIVE - UPDATING'}\n`);

  const res = await pool.query(`
      SELECT id, reference, reference_id, amount 
      FROM order_transaction 
      WHERE reference LIKE 'pay_%'
  `);

  console.log(`Found ${res.rowCount} transactions to fix`);

  let updated = 0;

  for (const tx of res.rows) {
      // Logic:
      // reference 'pay_Rp...' -> 'capture'
      // reference_id 'order_...' -> 'pay_Rp...' (The old reference becomes the new reference_id)
      
      const newReference = 'capture';
      const newReferenceId = tx.reference; // Use the payment ID as the reference ID

      if (!DRY_RUN) {
          await pool.query(
              `UPDATE order_transaction SET reference = $1, reference_id = $2 WHERE id = $3`,
              [newReference, newReferenceId, tx.id]
          );
          console.log(`  ✅ Tx ${tx.id}: ${tx.reference} -> ${newReference}, ref_id -> ${newReferenceId}`);
          updated++;
      } else {
          console.log(`  [DRY RUN] Tx ${tx.id}: Would update reference to '${newReference}' and reference_id to '${newReferenceId}'`);
          updated++;
      }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Transactions updated: ${updated}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  await pool.end();
}

main().catch(console.error);
