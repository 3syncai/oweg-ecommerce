import { getSharedDbPool } from "../lib/db-pool"
import { migrateAdminAccess } from "../lib/admin-access/schema"

/** Additive access schema upgrades, without changing any users, passwords or grants. */
export default async function migrateAccess() {
  const pool = getSharedDbPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await migrateAdminAccess(client)
    await client.query("COMMIT")
    console.log("Admin access schema is up to date; existing accounts and permissions were preserved.")
  } catch (error) { await client.query("ROLLBACK"); throw error }
  finally { client.release(); await pool.end() }
}
