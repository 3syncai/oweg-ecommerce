/**
 * Backfill order metadata for existing return/replacement requests.
 * Usage: node scripts/sync-return-order-metadata.js
 */
require("dotenv").config()
const { Pool } = require("pg")

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const res = await pool.query(
    `SELECT id, order_id, type, status, reason, created_at
     FROM return_request
     WHERE deleted_at IS NULL
     ORDER BY created_at ASC`
  )

  let updated = 0
  for (const row of res.rows) {
    const orderRes = await pool.query(`SELECT metadata FROM "order" WHERE id = $1`, [row.order_id])
    if (!orderRes.rows[0]) continue

    const existing = orderRes.rows[0].metadata || {}
    const metadata = {
      ...existing,
      return_request_id: row.id,
      return_request_type: row.type,
      return_request_status: row.status,
      return_request_reason: row.reason,
      return_requested_at: row.created_at?.toISOString?.() || row.created_at,
      return_status_updated_at: new Date().toISOString(),
    }

    await pool.query(`UPDATE "order" SET metadata = $2::jsonb, updated_at = now() WHERE id = $1`, [
      row.order_id,
      JSON.stringify(metadata),
    ])
    updated += 1
  }

  await pool.end()
  console.log(`Synced return metadata on ${updated} order(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
