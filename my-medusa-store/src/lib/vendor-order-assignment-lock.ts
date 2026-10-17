import { getSharedDbPool } from "./db-pool"

/** Serializes vendor acceptance and admin reassignment for one customer order. */
export async function withVendorOrderAssignmentLock<T>(orderId: string, action: () => Promise<T>): Promise<T> {
  const client = await getSharedDbPool().connect()
  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`vendor-assignment:${orderId}`])
    const result = await action()
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}
