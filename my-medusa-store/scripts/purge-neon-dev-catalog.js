/**
 * purge-neon-dev-catalog.js
 *
 * Wipes Neon dev catalog data only — products, collections, categories, tags,
 * flash-sale items, reviews, orders, and carts. Does NOT touch S3 or AWS RDS.
 *
 * Usage (from my-medusa-store/):
 *   $env:MEDUSA_ADMIN_BASIC = $env:MEDUSA_ADMIN_API_KEY   # or your sk_ secret
 *   $env:PURGE_NEON_CONFIRM = "yes"
 *   node scripts/purge-neon-dev-catalog.js
 *
 * Medusa backend must be running for the Admin API phase.
 */

const path = require("path");
const axios = require("axios");
const { Client } = require("pg");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const DB_URL = process.env.DATABASE_URL;
const BASE = process.env.MEDUSA_URL || "http://localhost:9000";
const ADMIN_KEY =
  process.env.MEDUSA_ADMIN_BASIC ||
  process.env.MEDUSA_ADMIN_API_KEY ||
  process.env.MEDUSA_ADMIN_TOKEN;

const COUNT_TABLES = [
  "product",
  "product_collection",
  "product_category",
  "flash_sale_item",
  "order",
];

/** Phase A — custom modules + orders/carts (children before parents). */
const PHASE_A_TABLES = [
  "flash_sale_item",
  "product_review",
  "reservation_item",
  // returns
  "return_request_item",
  "return_request",
  "return_item",
  "return_fulfillment",
  "return",
  // order leaf tables
  "order_line_item_adjustment",
  "order_line_item_tax_line",
  "order_line_item",
  "order_item",
  "order_shipping_method_adjustment",
  "order_shipping_method_tax_line",
  "order_shipping_method",
  "order_shipping",
  "order_transaction",
  "order_credit_line",
  "order_voucher",
  "order_promotion",
  "order_total_detail",
  "order_change_action",
  "order_change",
  "order_claim_item_image",
  "order_claim_item",
  "order_claim",
  "order_exchange_item",
  "order_exchange",
  "order_fulfillment",
  "order_metadata",
  "order_migration_summary",
  "order_summary",
  "order_cart",
  "order_address",
  // payments linked to orders
  "razorpay_payment",
  "admin_payments",
  "payment_session",
  "payment",
  "order_payment_collection",
  "payment_collection_payment_providers",
  "payment_collection",
  // fulfillments
  "fulfillment_item",
  "fulfillment_label",
  "fulfillment",
  "fulfillment_address",
  // order root
  "order",
  // carts
  "cart_line_item_adjustment",
  "cart_line_item_tax_line",
  "cart_line_item",
  "cart_shipping_method_adjustment",
  "cart_shipping_method_tax_line",
  "cart_shipping_method",
  "cart_promotion",
  "cart_payment_collection",
  "cart_address",
  "cart",
];

/** Phase C — orphan product/catalog rows (DB only, no S3). */
const PHASE_C_TABLES = [
  "reservation_item",
  "inventory_level",
  "product_variant_inventory_item",
  "inventory_item",
  "price",
  "price_preference",
  "product_variant_price_set",
  "price_set",
  "product_option_value",
  "product_option",
  "product_variant_option",
  "product_variant_product_image",
  "product_variant",
  "product_image",
  "product_sales_channel",
  "product_shipping_profile",
  "product_tag",
  "product_tags",
  "product_category_product",
  "product_commission",
  "product_commissions",
  "product",
  "product_type",
  "product_collection",
  "product_category",
];

function assertNeonTarget() {
  if (!DB_URL) {
    console.error("Missing DATABASE_URL in .env");
    process.exit(1);
  }
  if (!DB_URL.includes("neon.tech")) {
    console.error("ABORT: DATABASE_URL must point to Neon (neon.tech).");
    process.exit(1);
  }
  if (DB_URL.includes("rds.amazonaws.com")) {
    console.error("ABORT: DATABASE_URL must NOT be AWS RDS.");
    process.exit(1);
  }
  if (process.env.PURGE_NEON_CONFIRM !== "yes") {
    console.error(
      'ABORT: Set PURGE_NEON_CONFIRM=yes to confirm Neon dev catalog purge.'
    );
    process.exit(1);
  }
  console.log("✓ Neon safety guard passed");
  console.log(`  Target: ${DB_URL.replace(/:[^:@]+@/, ":***@")}`);
}

function pgClient() {
  return new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
}

async function getExistingTables(client) {
  const res = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  return new Set(res.rows.map((r) => r.table_name));
}

async function deleteFromTables(client, tables, label) {
  const existing = await getExistingTables(client);
  console.log(`\n── ${label} ──`);
  for (const table of tables) {
    if (!existing.has(table)) {
      console.log(`  – ${table.padEnd(42)} (not found, skipping)`);
      continue;
    }
    try {
      const res = await client.query(`DELETE FROM "${table}"`);
      console.log(`  ✓ ${table.padEnd(42)} — ${res.rowCount} rows deleted`);
    } catch (err) {
      console.warn(`  ⚠ ${table.padEnd(42)} — ${err.message}`);
    }
  }
}

async function printCounts(client, label) {
  console.log(`\n📊 ${label}:`);
  for (const table of COUNT_TABLES) {
    try {
      const res = await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
      console.log(`  ${table}: ${res.rows[0].n}`);
    } catch {
      console.log(`  ${table}: (table missing)`);
    }
  }
}

function adminClient() {
  if (!ADMIN_KEY) {
    throw new Error(
      "Missing admin credentials. Set MEDUSA_ADMIN_BASIC or MEDUSA_ADMIN_API_KEY."
    );
  }
  return axios.create({
    baseURL: BASE,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${ADMIN_KEY}`,
    },
    timeout: 120000,
  });
}

async function apiList(client, apiPath, key, limit = 100) {
  const { data } = await client.get(apiPath, { params: { limit, offset: 0 } });
  return data?.[key] ?? [];
}

async function apiDelete(client, apiPath, id, label) {
  try {
    await client.delete(`${apiPath}/${id}`);
    return true;
  } catch (e) {
    const msg = e.response?.data?.message || e.message;
    if (!msg.includes("ECONNRESET") && !msg.includes("ECONNREFUSED")) {
      console.log(`  ✗ failed to delete ${label} ${id}: ${msg}`);
    }
    return false;
  }
}

async function apiWipe(client, apiPath, key, human) {
  console.log(`\n🧹 Admin API: deleting ${human}…`);
  let total = 0;
  while (true) {
    const items = await apiList(client, apiPath, key, 100);
    if (items.length === 0) break;

    let batchDeleted = 0;
    for (const item of items) {
      const ok = await apiDelete(client, apiPath, item.id, human.slice(0, -1));
      if (ok) {
        total++;
        batchDeleted++;
        if (total % 50 === 0) {
          console.log(`  … ${total} ${human} deleted so far`);
        }
      }
    }

    if (batchDeleted === 0) {
      console.log(
        `  ⚠ No progress this batch — remaining ${human} will be cleared via SQL fallback.`
      );
      break;
    }

    // Avoid hammering the backend when many deletes fail.
    if (total >= 200 && batchDeleted < 5) {
      console.log(`  ⚠ Slow progress — switching to SQL fallback for ${human}.`);
      break;
    }
  }
  console.log(`  ✓ ${total} ${human} deleted via API`);
}

async function phaseBAdminApi() {
  console.log("\n══ Phase B — Admin API catalog wipe ══");
  const client = adminClient();

  try {
    await client.get("/admin/products", { params: { limit: 1 } });
  } catch (e) {
    console.error(
      `Cannot reach Medusa admin at ${BASE}. Is the backend running?`
    );
    console.error(e.response?.status, e.response?.data?.message || e.message);
    console.warn("Skipping Phase B — SQL fallback will handle remaining rows.");
    return;
  }

  await apiWipe(client, "/admin/products", "products", "products");
  await apiWipe(client, "/admin/collections", "collections", "collections");
  await apiWipe(
    client,
    "/admin/product-categories",
    "product_categories",
    "categories"
  );
  await apiWipe(client, "/admin/product-tags", "product_tags", "tags");
}

async function main() {
  console.log("==============================");
  console.log("  OWEG — Neon Dev Catalog Purge");
  console.log("  (S3 / AWS RDS untouched)     ");
  console.log("==============================\n");

  assertNeonTarget();

  const client = pgClient();
  await client.connect();
  console.log("🗄️  Connected to Neon database.");

  await printCounts(client, "Before purge");

  await deleteFromTables(client, PHASE_A_TABLES, "Phase A — flash-sale, reviews, orders, carts");

  await client.end();

  try {
    if (process.env.PURGE_SKIP_API === "yes") {
      console.log("\n══ Phase B — skipped (PURGE_SKIP_API=yes) ══");
    } else {
      await phaseBAdminApi();
    }
  } catch (e) {
    console.warn(`\n⚠ Admin API phase error (SQL fallback will continue): ${e.message}`);
  }

  const client2 = pgClient();
  await client2.connect();
  await deleteFromTables(
    client2,
    PHASE_C_TABLES,
    "Phase C — SQL fallback for orphan catalog rows"
  );
  await printCounts(client2, "After purge");
  await client2.end();

  const remaining = await (async () => {
    const c = pgClient();
    await c.connect();
    const r = await c.query(
      `SELECT COUNT(*)::int AS n FROM product WHERE deleted_at IS NULL`
    );
    await c.end();
    return r.rows[0].n;
  })();

  if (remaining === 0) {
    console.log("\n✅ Neon dev catalog purge complete. Ready for re-migration.");
  } else {
    console.warn(
      `\n⚠ ${remaining} product(s) still remain. Check warnings above.`
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("❌ Purge failed:", e.message);
  process.exit(1);
});
