/**
 * Release inventory reservations held by failed / abandoned online checkout drafts.
 *
 * Does NOT delete drafts (admin payment-status UI may still show them).
 *
 * Usage (from my-medusa-store):
 *   node scripts/release-failed-draft-reservations.js
 *   node scripts/release-failed-draft-reservations.js --dry-run
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") })

const { Pool } = require("pg")

const dryRun = process.argv.includes("--dry-run")

function createPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set")
  }
  return new Pool({
    connectionString,
    ssl: connectionString.includes("amazonaws.com")
      ? { rejectUnauthorized: false }
      : undefined,
  })
}

function isFailedOrAbandonedOnline(meta) {
  const metadata = meta && typeof meta === "object" ? meta : {}
  const checkoutStatus = String(metadata.checkout_status || "").toLowerCase()
  const paymentMethod = String(metadata.payment_method || "").toLowerCase()
  const razorpayStatus = String(metadata.razorpay_payment_status || "").toLowerCase()

  if (checkoutStatus === "payment_failed") return true
  if (razorpayStatus === "failed" || razorpayStatus === "created") return true
  if (paymentMethod === "razorpay" && razorpayStatus !== "captured") return true
  return false
}

async function main() {
  const pool = createPool()
  const client = await pool.connect()

  try {
    const draftsRes = await client.query(
      `SELECT id, display_id, status, metadata
       FROM "order"
       WHERE status = 'draft'
       ORDER BY created_at DESC
       LIMIT 500`
    )

    const targets = draftsRes.rows.filter((row) => isFailedOrAbandonedOnline(row.metadata))
    console.log(`Found ${draftsRes.rows.length} draft(s); ${targets.length} failed/abandoned online.`)
    if (dryRun) console.log("(--dry-run: no deletes will be applied)")

    let totalReleased = 0

    for (const draft of targets) {
      const resRes = await client.query(
        `SELECT ri.id, ri.inventory_item_id, ri.location_id, ri.quantity
         FROM reservation_item ri
         INNER JOIN order_item oi ON oi.item_id = ri.line_item_id
         WHERE oi.order_id = $1`,
        [draft.id]
      )

      if (!resRes.rows.length) {
        console.log(`  #${draft.display_id || "?"} ${draft.id}: no reservations`)
        continue
      }

      console.log(
        `  #${draft.display_id || "?"} ${draft.id}: ${resRes.rows.length} reservation(s)`
      )

      if (dryRun) {
        totalReleased += resRes.rows.length
        continue
      }

      await client.query("BEGIN")
      try {
        for (const row of resRes.rows) {
          const qty = Number(row.quantity) || 0
          await client.query(`DELETE FROM reservation_item WHERE id = $1`, [row.id])
          if (qty > 0 && row.inventory_item_id && row.location_id) {
            await client.query(
              `UPDATE inventory_level
               SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) - $1),
                   updated_at = now()
               WHERE inventory_item_id = $2
                 AND location_id = $3`,
              [qty, row.inventory_item_id, row.location_id]
            )
          }
        }
        await client.query("COMMIT")
        totalReleased += resRes.rows.length
      } catch (err) {
        await client.query("ROLLBACK")
        console.error(`  Failed on ${draft.id}:`, err.message || err)
      }
    }

    console.log(
      dryRun
        ? `Dry run complete. Would release ${totalReleased} reservation(s).`
        : `Done. Released ${totalReleased} reservation(s).`
    )
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
