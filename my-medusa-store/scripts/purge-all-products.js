/**
 * purge-all-products.js
 * Deletes every product record from the DB and every object from S3.
 * Run with: node scripts/purge-all-products.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { Client } = require("pg");

const BUCKET   = process.env.S3_BUCKET;
const REGION   = process.env.S3_REGION;
const DB_URL   = process.env.DATABASE_URL;

// ──────────────────────────────────────────────
// 1.  S3 – delete every object in the bucket
// ──────────────────────────────────────────────
async function purgeS3() {
  const s3 = new S3Client({
    region: REGION,
    credentials: {
      accessKeyId:     process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });

  console.log(`\n🪣  Scanning bucket: ${BUCKET} (${REGION})`);

  let totalDeleted = 0;
  let continuationToken;

  do {
    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket:            BUCKET,
        ContinuationToken: continuationToken,
      })
    );

    const objects = listRes.Contents ?? [];
    if (objects.length === 0) break;

    const keys = objects.map((o) => ({ Key: o.Key }));

    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: keys, Quiet: true },
      })
    );

    totalDeleted      += keys.length;
    continuationToken  = listRes.NextContinuationToken;
    console.log(`  deleted ${totalDeleted} objects so far…`);
  } while (continuationToken);

  console.log(`✅  S3 purge complete — ${totalDeleted} objects removed.\n`);
}

// ──────────────────────────────────────────────
// 2.  PostgreSQL – wipe all product-related rows
// ──────────────────────────────────────────────
async function purgeDB() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("🗄️  Connected to database.");

  // Medusa v2 product tables in safe deletion order
  // (children before parents to respect FK constraints)
  const tables = [
    // inventory / fulfilment
    "inventory_level",
    "inventory_item",
    "product_variant_inventory_item",
    // pricing
    "price",
    "price_preference",
    "price_set_rule_type",
    "price_set",
    // product leaf tables
    "product_option_value",
    "product_option",
    "product_variant",
    "product_image",
    "product_sales_channel",
    "product_tag",          // join table product <-> tag
    // product root
    "product",
    // standalone lookup tables (safe to clear)
    "product_type",
    "product_collection",
    "product_category",
  ];

  for (const table of tables) {
    try {
      const res = await client.query(`DELETE FROM "${table}"`);
      console.log(`  ✓ ${table.padEnd(40)} — ${res.rowCount} rows deleted`);
    } catch (err) {
      // table might not exist in this schema version, skip gracefully
      if (err.code === "42P01") {
        console.log(`  – ${table.padEnd(40)} (table not found, skipping)`);
      } else {
        console.warn(`  ⚠  ${table}: ${err.message}`);
      }
    }
  }

  await client.end();
  console.log("\n✅  Database purge complete.\n");
}

// ──────────────────────────────────────────────
// 3.  Run
// ──────────────────────────────────────────────
(async () => {
  console.log("==============================");
  console.log("  OWEG – Full Product Purge  ");
  console.log("==============================");

  await purgeS3().catch((e) => {
    console.error("S3 purge failed:", e.message);
    process.exit(1);
  });

  await purgeDB().catch((e) => {
    console.error("DB purge failed:", e.message);
    process.exit(1);
  });

  console.log("🎉  All done — products and images wiped clean.");
})();
