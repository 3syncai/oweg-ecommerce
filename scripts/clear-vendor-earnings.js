/**
 * Delete all rows from vendor_earnings_log (or for one vendor).
 *
 * Usage:
 *   CLEAR_VENDOR_EARNINGS_CONFIRM=yes node scripts/clear-vendor-earnings.js
 *   CLEAR_VENDOR_EARNINGS_CONFIRM=yes VENDOR_ID=01KBC... node scripts/clear-vendor-earnings.js
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

async function main() {
  if (process.env.CLEAR_VENDOR_EARNINGS_CONFIRM !== "yes") {
    console.error("Set CLEAR_VENDOR_EARNINGS_CONFIRM=yes to run.");
    process.exit(1);
  }

  if (!DB_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new Client({
    connectionString: DB_URL,
    ssl: DB_URL.includes("amazonaws.com") ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  const preview = VENDOR_ID
    ? await client.query(
        `SELECT id, vendor_id, order_display_id, net_amount, status FROM vendor_earnings_log WHERE vendor_id = $1`,
        [VENDOR_ID]
      )
    : await client.query(
        `SELECT id, vendor_id, order_display_id, net_amount, status FROM vendor_earnings_log`
      );

  console.log(`Found ${preview.rowCount} earnings row(s):`);
  for (const row of preview.rows) {
    console.log(
      `  #${row.order_display_id || "?"} vendor=${row.vendor_id} net=${row.net_amount} status=${row.status}`
    );
  }

  const result = VENDOR_ID
    ? await client.query(`DELETE FROM vendor_earnings_log WHERE vendor_id = $1`, [VENDOR_ID])
    : await client.query(`DELETE FROM vendor_earnings_log`);

  console.log(`Deleted ${result.rowCount} row(s) from vendor_earnings_log.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
