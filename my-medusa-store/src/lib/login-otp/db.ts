import { Pool } from "pg"

let sharedPool: Pool | null = null

export function getLoginOtpPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured")
  }

  if (!sharedPool) {
    sharedPool = new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  }

  return sharedPool
}
