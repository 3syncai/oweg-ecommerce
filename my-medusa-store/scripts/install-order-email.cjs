const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Pool } = require('pg');

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Missing --apply');
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config();
  if (!process.env.DATABASE_URL) throw new Error('Missing database configuration');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    await pool.query(readFileSync(join(__dirname, '../migrations/order-email-outbox.sql'), 'utf8'));
    console.log('Order email outbox schema installed.');
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error('Order email migration stopped. Verify --apply, the target database and schema permissions.');
  process.exitCode = 1;
});
