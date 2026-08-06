import { Pool } from "pg"

let sharedPool: Pool | null = null

/**
 * Process-wide Postgres pool. Prefer this over `new Pool()` per request —
 * remote RDS handshakes are a major source of vendor API latency.
 */
export function getSharedDbPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured")
  }
  if (!sharedPool) {
    const isRds = process.env.DATABASE_URL.includes("rds.amazonaws.com")
    sharedPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: isRds ? { rejectUnauthorized: false } : undefined,
    })
    sharedPool.on("error", (err) => {
      console.error("[db-pool] unexpected idle client error", err)
    })
  }
  return sharedPool
}
