/**
 * Delete all orders that include products from a given vendor.
 *
 * Usage (from repo root):
 *   CLEAR_VENDOR_ORDERS_CONFIRM=yes VENDOR_ID=vendor_xxx node scripts/clear-vendor-orders.js
 *
 * Or by vendor email:
 *   CLEAR_VENDOR_ORDERS_CONFIRM=yes VENDOR_EMAIL=test@example.com node scripts/clear-vendor-orders.js
 */

const path = require("path");
const fs = require("fs");
const { Client } = require("pg");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, "../.env"));
loadEnvFile(path.resolve(__dirname, "../my-medusa-store/.env"));

const DB_URL = process.env.DATABASE_URL;
const VENDOR_ID = process.env.VENDOR_ID;
const VENDOR_EMAIL = process.env.VENDOR_EMAIL;

function pgClient() {
  if (!DB_URL) throw new Error("DATABASE_URL is required");
  return new Client({
    connectionString: DB_URL,
    ssl: DB_URL.includes("amazonaws.com") ? { rejectUnauthorized: false } : undefined,
  });
}

async function resolveVendorId(client) {
  if (VENDOR_ID) return VENDOR_ID;
  if (!VENDOR_EMAIL) {
    throw new Error("Set VENDOR_ID or VENDOR_EMAIL");
  }
  const res = await client.query(`SELECT id FROM vendor WHERE email = $1 LIMIT 1`, [
    VENDOR_EMAIL,
  ]);
  if (!res.rows[0]?.id) {
    throw new Error(`No vendor found for email ${VENDOR_EMAIL}`);
  }
  return res.rows[0].id;
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
  );
  return res.rows.map((row) => row.id);
}

async function deleteOrders(client, orderIds) {
  if (orderIds.length === 0) return;

  const run = async (label, sql, params = [orderIds]) => {
    try {
      const res = await client.query(sql, params);
      if (res.rowCount > 0) {
        console.log(`  ✓ ${label}: ${res.rowCount} rows`);
      }
    } catch (err) {
      console.warn(`  ⚠ ${label}: ${err.message}`);
    }
  };

  await run("vendor_earnings_log", `DELETE FROM vendor_earnings_log WHERE order_id = ANY($1::text[])`);
  await run("wallet_ledger", `DELETE FROM wallet_ledger WHERE order_id = ANY($1::text[])`);
  await run(
    "affiliate_commission_log",
    `DELETE FROM affiliate_commission_log WHERE order_id = ANY($1::text[])`
  );
  await run(
    "customer_referrer_coins_log",
    `DELETE FROM customer_referrer_coins_log WHERE order_id = ANY($1::text[])`
  );

  await run(
    "order_line_item_adjustment",
    `DELETE FROM order_line_item_adjustment
     WHERE item_id IN (SELECT item_id FROM order_item WHERE order_id = ANY($1::text[]))`
  );
  await run(
    "order_line_item_tax_line",
    `DELETE FROM order_line_item_tax_line
     WHERE item_id IN (SELECT item_id FROM order_item WHERE order_id = ANY($1::text[]))`
  );
  await run(
    "order_line_item",
    `DELETE FROM order_line_item
     WHERE id IN (SELECT item_id FROM order_item WHERE order_id = ANY($1::text[]))`
  );
  await run("order_item", `DELETE FROM order_item WHERE order_id = ANY($1::text[])`);

  await run(
    "fulfillment_item",
    `DELETE FROM fulfillment_item
     WHERE fulfillment_id IN (SELECT fulfillment_id FROM order_fulfillment WHERE order_id = ANY($1::text[]))`
  );
  await run(
    "fulfillment_label",
    `DELETE FROM fulfillment_label
     WHERE fulfillment_id IN (SELECT fulfillment_id FROM order_fulfillment WHERE order_id = ANY($1::text[]))`
  );
  await run("order_fulfillment", `DELETE FROM order_fulfillment WHERE order_id = ANY($1::text[])`);
  await run(
    "fulfillment",
    `DELETE FROM fulfillment f
     WHERE NOT EXISTS (SELECT 1 FROM order_fulfillment ofu WHERE ofu.fulfillment_id = f.id)`
  );

  await run("order_shipping_method_adjustment", `DELETE FROM order_shipping_method_adjustment WHERE order_id = ANY($1::text[])`);
  await run("order_shipping_method_tax_line", `DELETE FROM order_shipping_method_tax_line WHERE order_id = ANY($1::text[])`);
  await run("order_shipping_method", `DELETE FROM order_shipping_method WHERE order_id = ANY($1::text[])`);
  await run("order_shipping", `DELETE FROM order_shipping WHERE order_id = ANY($1::text[])`);
  await run("order_transaction", `DELETE FROM order_transaction WHERE order_id = ANY($1::text[])`);
  await run("order_credit_line", `DELETE FROM order_credit_line WHERE order_id = ANY($1::text[])`);
  await run("order_summary", `DELETE FROM order_summary WHERE order_id = ANY($1::text[])`);
  await run("order_payment_collection", `DELETE FROM order_payment_collection WHERE order_id = ANY($1::text[])`);
  await run("order_address", `DELETE FROM order_address WHERE order_id = ANY($1::text[])`);
  await run("order", `DELETE FROM "order" WHERE id = ANY($1::text[])`);
}

async function main() {
  if (process.env.CLEAR_VENDOR_ORDERS_CONFIRM !== "yes") {
    console.error("Refusing to run. Set CLEAR_VENDOR_ORDERS_CONFIRM=yes");
    process.exit(1);
  }

  const client = pgClient();
  await client.connect();

  try {
    const vendorId = await resolveVendorId(client);
    console.log(`Vendor: ${vendorId}`);

    const orderIds = await findVendorOrderIds(client, vendorId);
    console.log(`Found ${orderIds.length} orders to delete`);

    if (orderIds.length === 0) {
      console.log("Nothing to delete.");
      return;
    }

    console.log(orderIds.join("\n"));
    await deleteOrders(client, orderIds);
    console.log(`\nDone. Deleted ${orderIds.length} vendor orders.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
