// src/scripts/verify-db-clean.ts
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('=== Verifying Database Cleanliness ===\n');

  const tables = [
    '"order"',
    'order_summary',
    'order_transaction',
    'payment_collection',
    'payment',
    'payment_session',
    'refund',
    'line_item',
    'order_item',
    'order_address',
    'order_payment_collection',
    'draft_order'
  ];

  let notClean = false;

  console.log('Table Counts:');
  console.log('-------------');

  for (const table of tables) {
    try {
      const res = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      const count = parseInt(res.rows[0].count, 10);
      
      const status = count === 0 ? '✅ Empty' : `❌ ${count} rows`;
      console.log(`${table.padEnd(30)} : ${status}`);
      
      if (count > 0) notClean = true;
    } catch (e: any) {
      // Handle missing tables gracefully (e.g. order_item vs line_item confusion)
      if (e.code === '42P01') { // undefined_table
         console.log(`${table.padEnd(30)} : ⚠️  Table does not exist`);
      } else {
         console.log(`${table.padEnd(30)} : ❌ Error checking (${e.message})`);
      }
    }
  }

  console.log('\n-------------');
  if (notClean) {
    console.log('⚠️  Database is NOT fully clean. See above.');
  } else {
    console.log('✅ Database is CLEAN. Ready for fresh orders.');
  }

  await pool.end();
}

main().catch(console.error);
