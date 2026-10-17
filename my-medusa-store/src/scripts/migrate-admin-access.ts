import type { ExecArgs } from "@medusajs/types"
import { getSharedDbPool } from "../lib/db-pool"
import { migrateAdminAccess } from "../lib/admin-access/schema"

/** Additive access migration; does not create/promote users or change existing roles. */
export default async function migrate(_args: ExecArgs) {
  const pool = getSharedDbPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext('oweg-superadmin-bootstrap'))")
    await migrateAdminAccess(client)
    await client.query("COMMIT")
    console.log("Admin access schema updated; existing credentials and roles preserved.")
  } catch (error) { await client.query("ROLLBACK"); throw error }
  finally { client.release(); await pool.end() }
}
