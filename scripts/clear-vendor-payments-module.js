/**
 * Clear order + payments data for one vendor (keeps products/inventory/brand/auth).
 *
 * Usage:
 *   CLEAR_VENDOR_PAYMENTS_CONFIRM=yes VENDOR_EMAIL=vishal@gmail.com node scripts/clear-vendor-payments-module.js
 */
const path = require("path")
const fs = require("fs")
const { Client } = require("pg")

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(path.resolve(__dirname, "../.env"))
loadEnvFile(path.resolve(__dirname, "../my-medusa-store/.env"))

const DB_URL = process.env.DATABASE_URL
const VENDOR_EMAIL = process.env.VENDOR_EMAIL || "vishal@gmail.com"

function pgClient() {
  if (!DB_URL) throw new Error("DATABASE_URL is required")
  return new Client({
    connectionString: DB_URL,
    ssl: DB_URL.includes("amazonaws.com") ? { rejectUnauthorized: false } : undefined,
  })
}

async function findVendorOrderIds(client, vendorId) {
  const res = await client.query(
    `
      SELECT DISTINCT o.id
      FROM "order" o
      JOIN order_item oi ON oi.order_id = o.id
      JOIN order_line_item oli ON oi.item_id = oli.id
      LEFT JOIN product_variant pv ON oli.variant_id = pv.id
      LEFT JOIN product p ON COALESCE(oli.product_id, pv.product_id) = p.id
      WHERE p.metadata->>'vendor_id' = $1
    `,
    [vendorId]
  )
  return res.rows.map((row) => row.id)
}

async function deleteOrders(client, orderIds) {
  if (orderIds.length === 0) return

  const run = async (label, sql, params = [orderIds]) => {
    const sp = `sp_${label.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40)}`
    try {
      await client.query(`SAVEPOINT ${sp}`)
      const res = await client.query(sql, params)
      await client.query(`RELEASE SAVEPOINT ${sp}`)
      if (res.rowCount > 0) console.log(`  ✓ ${label}: ${res.rowCount} rows`)
    } catch (err) {
      try {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`)
      } catch {
        // savepoint already gone; the outer transaction handles it
      }
      console.warn(`  ⚠ ${label}: ${err.message}`)
    }
  }

  await run(
    "return_request_item",
    `DELETE FROM return_request_item
     WHERE return_request_id IN (
       SELECT id FROM return_request WHERE order_id = ANY($1::text[])
     )`
  )
  await run(
    "return_request",
    `DELETE FROM return_request WHERE order_id = ANY($1::text[])`
  )

  await run(
    "vendor_earnings_log (by order)",
    `DELETE FROM vendor_earnings_log WHERE order_id = ANY($1::text[])`
  )
  await run("wallet_ledger", `DELETE FROM wallet_ledger WHERE order_id = ANY($1::text[])`)
  await run(
    "affiliate_commission_log",
    `DELETE FROM affiliate_commission_log WHERE order_id = ANY($1::text[])`
  )
  await run(
    "customer_referrer_coins_log",
    `DELETE FROM customer_referrer_coins_log WHERE order_id = ANY($1::text[])`
  )

  await run(
    "order_line_item_adjustment",
    `DELETE FROM order_line_item_adjustment
     WHERE item_id IN (SELECT item_id FROM order_item WHERE order_id = ANY($1::text[]))`
  )
  await run(
    "order_line_item_tax_line",
    `DELETE FROM order_line_item_tax_line
     WHERE item_id IN (SELECT item_id FROM order_item WHERE order_id = ANY($1::text[]))`
  )
  await run(
    "order_line_item",
    `DELETE FROM order_line_item
     WHERE id IN (SELECT item_id FROM order_item WHERE order_id = ANY($1::text[]))`
  )
  await run("order_item", `DELETE FROM order_item WHERE order_id = ANY($1::text[])`)

  await run(
    "fulfillment_item",
    `DELETE FROM fulfillment_item
     WHERE fulfillment_id IN (SELECT fulfillment_id FROM order_fulfillment WHERE order_id = ANY($1::text[]))`
  )
  await run(
    "fulfillment_label",
    `DELETE FROM fulfillment_label
     WHERE fulfillment_id IN (SELECT fulfillment_id FROM order_fulfillment WHERE order_id = ANY($1::text[]))`
  )
  await run("order_fulfillment", `DELETE FROM order_fulfillment WHERE order_id = ANY($1::text[])`)
  await run(
    "fulfillment",
    `DELETE FROM fulfillment f
     WHERE NOT EXISTS (SELECT 1 FROM order_fulfillment ofu WHERE ofu.fulfillment_id = f.id)`,
    []
  )

  await run(
    "order_shipping_method_adjustment",
    `DELETE FROM order_shipping_method_adjustment WHERE order_id = ANY($1::text[])`
  )
  await run(
    "order_shipping_method_tax_line",
    `DELETE FROM order_shipping_method_tax_line WHERE order_id = ANY($1::text[])`
  )
  await run(
    "order_shipping_method",
    `DELETE FROM order_shipping_method WHERE order_id = ANY($1::text[])`
  )
  await run("order_shipping", `DELETE FROM order_shipping WHERE order_id = ANY($1::text[])`)
  await run("order_transaction", `DELETE FROM order_transaction WHERE order_id = ANY($1::text[])`)
  await run("order_credit_line", `DELETE FROM order_credit_line WHERE order_id = ANY($1::text[])`)
  await run("order_summary", `DELETE FROM order_summary WHERE order_id = ANY($1::text[])`)
  await run(
    "order_payment_collection",
    `DELETE FROM order_payment_collection WHERE order_id = ANY($1::text[])`
  )
  await run("order_address", `DELETE FROM order_address WHERE order_id = ANY($1::text[])`)
  await run("order", `DELETE FROM "order" WHERE id = ANY($1::text[])`)
}

async function preview(client, email) {
  const v = await client.query(
    "SELECT id, email, store_name FROM vendor WHERE email = $1",
    [email]
  )
  if (!v.rows[0]) throw new Error(`No vendor found for email ${email}`)
  const id = v.rows[0].id

  const orders = await client.query(
    `
    SELECT COUNT(DISTINCT o.id)::int AS c
    FROM "order" o
    JOIN order_item oi ON oi.order_id = o.id
    JOIN order_line_item oli ON oi.item_id = oli.id
    LEFT JOIN product_variant pv ON oli.variant_id = pv.id
    LEFT JOIN product p ON COALESCE(oli.product_id, pv.product_id) = p.id
    WHERE p.metadata->>'vendor_id' = $1
    `,
    [id]
  )
  const earn = await client.query(
    "SELECT COUNT(*)::int AS c FROM vendor_earnings_log WHERE vendor_id = $1",
    [id]
  )
  const pay = await client.query(
    `SELECT COUNT(*)::int AS c,
            COALESCE(SUM(CASE WHEN status = 'processed' THEN net_amount ELSE 0 END), 0)::float AS withdrawn
     FROM vendor_payout WHERE vendor_id = $1`,
    [id]
  )
  let reports = { c: 0 }
  try {
    const r = await client.query(
      "SELECT COUNT(*)::int AS c FROM vendor_report WHERE vendor_id = $1",
      [id]
    )
    reports = r.rows[0]
  } catch {
    // vendor_report table is optional in some environments
  }

  const products = await client.query(
    "SELECT COUNT(*)::int AS c FROM product WHERE metadata->>'vendor_id' = $1",
    [id]
  )
  const users = await client.query(
    "SELECT COUNT(*)::int AS c FROM vendor_user WHERE vendor_id = $1",
    [id]
  )

  return {
    vendor_id: id,
    email: v.rows[0].email,
    store_name: v.rows[0].store_name,
    orders: orders.rows[0].c,
    earnings: earn.rows[0].c,
    payouts: pay.rows[0],
    reports,
    products_kept: products.rows[0].c,
    vendor_users_kept: users.rows[0].c,
  }
}

async function main() {
  const previewOnly = process.env.PREVIEW_ONLY === "yes"

  if (!previewOnly && process.env.CLEAR_VENDOR_PAYMENTS_CONFIRM !== "yes") {
    console.error("Refusing to run. Set CLEAR_VENDOR_PAYMENTS_CONFIRM=yes (or PREVIEW_ONLY=yes)")
    process.exit(1)
  }

  const client = pgClient()
  await client.connect()

  try {
    const before = await preview(client, VENDOR_EMAIL)
    console.log("Preview:", JSON.stringify(before, null, 2))

    if (previewOnly) return

    const vendorId = before.vendor_id
    console.log(`\nWiping orders/payments for ${before.email} (${vendorId})...`)

    const orderIds = await findVendorOrderIds(client, vendorId)
    console.log(`Found ${orderIds.length} orders to delete`)

    await client.query("BEGIN")
    await deleteOrders(client, orderIds)

    const earn = await client.query(
      `DELETE FROM vendor_earnings_log WHERE vendor_id = $1`,
      [vendorId]
    )
    console.log(`  ✓ vendor_earnings_log (all for vendor): ${earn.rowCount} rows`)

    const payout = await client.query(`DELETE FROM vendor_payout WHERE vendor_id = $1`, [
      vendorId,
    ])
    console.log(`  ✓ vendor_payout: ${payout.rowCount} rows`)

    try {
      const reports = await client.query(`DELETE FROM vendor_report WHERE vendor_id = $1`, [
        vendorId,
      ])
      console.log(`  ✓ vendor_report: ${reports.rowCount} rows`)
    } catch (err) {
      console.warn(`  ⚠ vendor_report: ${err.message}`)
    }

    await client.query("COMMIT")

    const after = await preview(client, VENDOR_EMAIL)
    const ordersLeft = await findVendorOrderIds(client, vendorId)

    console.log("\nDone.")
    console.log(
      JSON.stringify(
        {
          deleted_orders: orderIds.length,
          products_kept: after.products_kept,
          vendor_users_kept: after.vendor_users_kept,
          earnings_left: after.earnings,
          payouts_left: after.payouts.c,
          orders_left: ordersLeft.length,
        },
        null,
        2
      )
    )
  } catch (err) {
    try {
      await client.query("ROLLBACK")
    } catch {
      // connection may already be closed
    }
    throw err
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
