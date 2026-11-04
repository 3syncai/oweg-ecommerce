// Explicit operator action only. Extends oweg_push_subscription for FCM/APNs tokens.
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { Pool } = require('pg');
async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Back up and rehearse first, then pass --apply.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, '../migrations/native-push.sql'), 'utf8'));
    console.log('Native push columns installed. No campaigns were sent.');
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Native push migration failed. Verify connection on an isolated restore before retrying.'); process.exitCode = 1; });
