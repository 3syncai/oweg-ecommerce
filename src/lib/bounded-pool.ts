import { Pool } from 'pg';

const pools = new Map<string, Pool>();
/** One bounded pool per connection configuration in each server process. */
export function getBoundedPool(connectionString: string, legacyAwsSsl = false): Pool {
  const key = `${legacyAwsSsl}:${connectionString}`;
  let pool = pools.get(key);
  if (!pool) {
    pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ...(legacyAwsSsl && connectionString.includes('amazonaws.com') ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    // Idle sockets may be closed by a pooler/network; pg removes them automatically.
    pool.on('error', () => { console.error('Idle database connection closed'); });
    pools.set(key, pool);
  }
  return pool;
}
