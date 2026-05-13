import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg"

/**
 * Shared Postgres pool for the customer-affiliate routes.
 *
 * Why this exists:
 *   - On Vercel, every request previously opened a new `Pool({ connectionString })`
 *     which spawns fresh TCP/TLS handshakes (~150–400ms each) and held a fresh
 *     DB connection for the lifetime of the request. Under any load that
 *     immediately exhausts Postgres `max_connections`.
 *   - Many managed Postgres providers (Hostinger, Neon, Supabase, RDS, …) require
 *     SSL when connecting from outside their network. The default `pg` Pool does
 *     not enable SSL unless the connection string carries `?sslmode=require`.
 *
 * What this gives you:
 *   1. ONE pool reused across hot Lambda invocations (via globalThis).
 *   2. Auto-SSL on remote hosts (skipped on localhost so dev still works).
 *   3. Conservative `max` so a single Lambda can't eat all DB slots.
 *   4. statement_timeout + query_timeout — long-running queries can't starve
 *      the pool forever.
 *   5. `withRetry` helper for the small class of transient errors that show
 *      up under burst (broken pipe, server reset).
 *   6. Idle-error handler so a stray network blip never crashes the Lambda.
 *
 * NOTE: For sustained "thousands of concurrent users" you still want PgBouncer
 * (or a managed pooler URL) in front of Postgres. This helper intentionally
 * stays compatible with that path — when you switch DATABASE_URL to the pooled
 * URL the code does not need to change.
 */

const DATABASE_URL = process.env.DATABASE_URL

const isLocalConnection = (url: string): boolean => {
  try {
    const u = new URL(url)
    return ["localhost", "127.0.0.1", "::1"].includes(u.hostname)
  } catch {
    return false
  }
}

const buildPool = (): Pool => {
  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not configured (set it in your Vercel project environment)"
    )
  }

  const sslDisabled = process.env.PGSSLMODE === "disable"
  const needsSSL = !sslDisabled && !isLocalConnection(DATABASE_URL)

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: needsSSL ? { rejectUnauthorized: false } : undefined,

    // Keep per-Lambda connection use small: 50 warm Lambdas × max 5 = 250
    // potential connections — well within most managed Postgres caps.
    max: 5,

    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,

    // Server-side guards. These cap any single query on the DB itself, even
    // if the Node side is hung waiting for results.
    statement_timeout: 15_000, // ms — abort queries after 15s
    query_timeout: 15_000,
  })

  pool.on("error", (err) => {
    console.error("[affiliate-pg] idle client error:", err.message)
  })

  return pool
}

type GlobalWithPool = typeof globalThis & {
  __oweg_affiliate_pg_pool?: Pool
}
const g = globalThis as GlobalWithPool

export function getAffiliatePool(): Pool {
  if (!g.__oweg_affiliate_pg_pool) {
    g.__oweg_affiliate_pg_pool = buildPool()
  }
  return g.__oweg_affiliate_pg_pool
}

/** Errors that almost always succeed on a second attempt. */
const TRANSIENT_PG_CODES = new Set([
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08000", // connection_exception
])

const TRANSIENT_MESSAGE_RE =
  /(broken pipe|server has gone away|connection terminated|read econnreset|socket hang up)/i

const isTransient = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false
  const e = err as { code?: string; message?: string }
  if (e.code && TRANSIENT_PG_CODES.has(e.code)) return true
  if (e.message && TRANSIENT_MESSAGE_RE.test(e.message)) return true
  return false
}

/**
 * Execute a query with one automatic retry on transient errors.
 * Use this for read-only/idempotent queries. Do NOT wrap writes in here unless
 * you know the operation is idempotent (the helpers in customer-affiliate-coins
 * already are).
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>
): Promise<QueryResult<T>> {
  const pool = getAffiliatePool()
  try {
    return await pool.query<T>(text, params as unknown[])
  } catch (err) {
    if (!isTransient(err)) throw err
    console.warn("[affiliate-pg] transient error — retrying once:", err)
    return await pool.query<T>(text, params as unknown[])
  }
}

/** Convenience for transactions. Caller is responsible for COMMIT/ROLLBACK. */
export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getAffiliatePool()
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}
