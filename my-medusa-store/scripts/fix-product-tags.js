// scripts/fix-product-tags.js
// Fixes &amp; and other HTML entities in existing product tags

require("dotenv").config();
const he = require("he");

const MEDUSA_URL = process.env.MEDUSA_URL || "http://localhost:9000";
const ADMIN_BASIC = process.env.MEDUSA_ADMIN_BASIC;
const DRY_RUN = (process.env.DRY_RUN || "true").toLowerCase() === "true";

function adminHeaders() {
  if (!ADMIN_BASIC) throw new Error("MEDUSA_ADMIN_BASIC not set");
  return {
    Authorization: `Basic ${ADMIN_BASIC}`,
    "Content-Type": "application/json",
  };
}

async function fetchAllProductTags() {
  const tags = [];
  let offset = 0;
  const limit = 100;

  console.log("📦 Fetching all product tags from Medusa...");

  while (true) {
    const url = `${MEDUSA_URL}/admin/product-tags?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: adminHeaders() });

    if (!res.ok) throw new Error(`Failed to fetch tags: ${res.status}`);

    const data = await res.json();

    if (!data.product_tags || data.product_tags.length === 0) break;

    tags.push(...data.product_tags);
    console.log(`   Fetched ${tags.length} tags...`);

    if (data.product_tags.length < limit) break;
    offset += limit;
  }

  return tags;
}

async function updateProductTag(tagId, newValue) {
  const url = `${MEDUSA_URL}/admin/product-tags/${tagId}`;
  const body = JSON.stringify({ value: newValue });

  const res = await fetch(url, {
    method: "POST",
    headers: adminHeaders(),
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Update failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return await res.json();
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║      Fix Product Tags (Decode HTML Entities)          ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");
  console.log(`Medusa URL: ${MEDUSA_URL}`);
  console.log(`Dry Run: ${DRY_RUN ? "✅ YES" : "❌ NO"}\n`);

  const tags = await fetchAllProductTags();
  console.log(`\n✅ Found ${tags.length} product tags\n`);

  let updated = 0;
  let skipped = 0;

  for (const tag of tags) {
    const oldValue = tag.value;
    const newValue = he.decode(oldValue);

    // Skip if no change needed
    if (oldValue === newValue) {
      skipped++;
      continue;
    }

    console.log(`\n[${updated + 1}] Tag ID: ${tag.id}`);
    console.log(`   OLD: "${oldValue}"`);
    console.log(`   NEW: "${newValue}"`);

    if (DRY_RUN) {
      console.log("   [DRY RUN] Would update");
      updated++;
    } else {
      try {
        await updateProductTag(tag.id, newValue);
        console.log("   ✅ Updated");
        updated++;
      } catch (err) {
        console.error(`   ❌ Error: ${err.message}`);
      }
    }
  }

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║                    SUMMARY                             ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log(`Total tags:         ${tags.length}`);
  console.log(`Updated:            ${updated}`);
  console.log(`Skipped (no HTML):  ${skipped}`);
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 This was a DRY RUN. To apply changes, run:");
    console.log("   DRY_RUN=false node scripts/fix-product-tags.js\n");
  } else {
    console.log("✅ All product tags have been fixed!\n");
  }
}

main().catch((err) => {
  console.error("\n❌ Script failed:", err.message);
  process.exit(1);
});
