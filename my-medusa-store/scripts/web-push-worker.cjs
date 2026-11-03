// A dedicated ecommerce notification process. It does not start Medusa/HTTP jobs.
const fs = require('node:fs');
const path = require('node:path');
const WORKER_ID = 'web-push';
const BATCH_PAUSE_MS = 2000;

async function runLoop({ tick, sleep, stopped, once = false }) {
  do {
    await tick();
    if (once || stopped()) break;
    // No overlapping intervals, even if a provider or database is slow.
    await sleep(BATCH_PAUSE_MS);
  } while (!stopped());
}

function healthy(row, now = Date.now()) {
  const success = row?.last_success_at ? new Date(row.last_success_at).getTime() : 0;
  const error = row?.last_error_at ? new Date(row.last_error_at).getTime() : 0;
  return Boolean(success && now - success < 180000 && error <= success);
}

async function main() {
  const root = path.resolve(__dirname, '..');
  require('dotenv').config({ path: path.join(root, '.env.local') });
  require('dotenv').config({ path: path.join(root, '.env') });
  if (process.env.WEB_PUSH_ENABLED !== 'true') throw new Error('Sending is disabled; configure the test environment before starting this worker.');
  let modulePath = path.join(root, '.medusa/server/src/lib/web-push/service.js');
  if (process.argv.includes('--dev')) {
    const hostname = new URL(process.env.DATABASE_URL || 'http://invalid').hostname;
    if (!['localhost','127.0.0.1','[::1]'].includes(hostname)) throw new Error('Dev worker requires a local isolated test database.');
    require('ts-node').register({ transpileOnly: true, project: path.join(root, 'tsconfig.json') });
    modulePath = path.join(root, 'src/lib/web-push/service.ts');
  } else if (!fs.existsSync(modulePath)) throw new Error('Build backend first (npm run build). Use --dev only with an isolated test database.');
  const { dispatchPushBatch, cleanupPushHistory, pushConfigured } = require(modulePath);
  if (!pushConfigured() || !process.env.DATABASE_URL) throw new Error('Database or VAPID configuration missing.');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3,
    idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000, query_timeout: 15000,
    application_name: 'oweg-notification-worker' });
  pool.on('error', () => console.error('[web-push] Idle database connection failed; the pool will reconnect.'));
  let stopping = false;
  let nextCleanup = 0;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    if (process.argv.includes('--check')) {
      const result = await pool.query('SELECT last_success_at,last_error_at FROM oweg_push_worker_state WHERE worker_id=$1', [WORKER_ID]);
      const state = result.rows[0];
      console.log(JSON.stringify({ worker: WORKER_ID, ...state, healthy: healthy(state) }));
      if (!healthy(state)) process.exitCode = 1;
      return;
    }
    await runLoop({ stopped: () => stopping, once: process.argv.includes('--once'), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
      tick: async () => {
        try {
          const result = await dispatchPushBatch(pool);
          if (!result.skipped && !result.disabled && Date.now() >= nextCleanup) {
            const cleanup = await cleanupPushHistory(pool);
            if (!cleanup.skipped) nextCleanup = Date.now() + 3600000;
          }
          if (!result.skipped && !result.disabled) await pool.query(`INSERT INTO oweg_push_worker_state(worker_id,last_success_at) VALUES($1,now())
            ON CONFLICT(worker_id) DO UPDATE SET last_success_at=now()`, [WORKER_ID]);
          console.log(JSON.stringify({ worker: WORKER_ID, ...result }));
        } catch {
          await pool.query(`INSERT INTO oweg_push_worker_state(worker_id,last_error_at) VALUES($1,now())
            ON CONFLICT(worker_id) DO UPDATE SET last_error_at=now()`, [WORKER_ID]).catch(() => undefined);
          console.error('[web-push] Batch failed; check configuration/database. No subscription secrets are logged.');
          if (process.argv.includes('--once')) process.exitCode = 1;
        }
      },
    });
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    await pool.end();
  }
}
module.exports = { runLoop, healthy, BATCH_PAUSE_MS };
if (require.main === module) main().catch(error => {
  // Startup errors are our fixed diagnostic messages, never provider response bodies.
  console.error(['Sending is disabled','Build backend first','Database or VAPID','Dev worker requires'].some(prefix => error.message.startsWith(prefix)) ? error.message : 'Notification worker could not start. Check the local configuration.');
  process.exitCode = 1;
});
