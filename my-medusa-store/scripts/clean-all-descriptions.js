// scripts/clean-all-descriptions.js
// Updates ALL existing Medusa products to have plain text descriptions

require("dotenv").config();
const he = require("he");

const MEDUSA_URL = process.env.MEDUSA_URL || "http://localhost:9000";
const ADMIN_BASIC = process.env.MEDUSA_ADMIN_BASIC;
const DRY_RUN = (process.env.DRY_RUN || "false").toLowerCase() === "true";

// ===== HTML to Plain Text Converter =====
function decodeMulti(s) {
  if (!s) return "";
  let prev = s;
  let next = he.decode(prev);
  let i = 0;
  while (next !== prev && i < 2) {
    prev = next;
    next = he.decode(prev);
    i++;
  }
  return prev;
}

function htmlToPlainText(raw) {
  if (!raw) return "";

  // First decode HTML entities
  let text = decodeMulti(raw);

  // Convert common block elements to line breaks
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n");

  // Remove ALL remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Clean up whitespace
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/^\s+|\s+$/gm, "")
    .trim();

  return text;
}

// ===== API Functions =====
function adminHeaders() {
  if (!ADMIN_BASIC) throw new Error("MEDUSA_ADMIN_BASIC not set in .env");
  return {
    Authorization: `Basic ${ADMIN_BASIC}`,
    "Content-Type": "application/json",
  };
}

async function fetchAllProducts() {
  const products = [];
  let offset = 0;
  const limit = 100;

  console.log("📦 Fetching all products from Medusa...");

  while (true) {
    const url = `${MEDUSA_URL}/admin/products?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: adminHeaders() });

    if (!res.ok) {
      throw new Error(
        `Failed to fetch products: ${res.status} ${res.statusText}`
      );
    }

    const data = await res.json();

    if (!data.products || data.products.length === 0) break;

    products.push(...data.products);
    console.log(`   Fetched ${products.length} products...`);

    if (data.products.length < limit) break;
    offset += limit;
  }

  return products;
}

async function updateProductDescription(productId, newDescription) {
  const url = `${MEDUSA_URL}/admin/products/${productId}`;
  const body = JSON.stringify({ description: newDescription });

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

// ===== Main Script =====
async function main() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║     Clean All Product Descriptions (HTML → Plain)     ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");
  console.log(`Medusa URL: ${MEDUSA_URL}`);
  console.log(
    `Dry Run: ${
      DRY_RUN
        ? "✅ YES (no changes will be made)"
        : "❌ NO (will update products)"
    }\n`
  );

  // Fetch all products
  const products = await fetchAllProducts();
  console.log(`\n✅ Found ${products.length} total products\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of products) {
    const oldDesc = product.description || "";

    // Skip if already plain text (no HTML tags detected)
    if (!oldDesc.includes("<") && !oldDesc.includes("&")) {
      skipped++;
      continue;
    }

    const newDesc = htmlToPlainText(oldDesc);

    // Show preview for first few products
    if (updated < 3) {
      console.log(`\n[${updated + 1}] ${product.title} (${product.id})`);
      console.log("   OLD:", oldDesc.slice(0, 100).replace(/\n/g, " "));
      console.log("   NEW:", newDesc.slice(0, 100).replace(/\n/g, " "));
    }

    if (DRY_RUN) {
      console.log("   [DRY RUN] Would update this product");
      updated++;
    } else {
      try {
        await updateProductDescription(product.id, newDesc);
        updated++;

        if (updated % 10 === 0) {
          console.log(`   ✓ Updated ${updated} products...`);
        }
      } catch (err) {
        console.error(`   ❌ Error updating ${product.id}: ${err.message}`);
        errors++;
      }
    }
  }

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║                    SUMMARY                             ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log(`Total products:     ${products.length}`);
  console.log(`Updated:            ${updated}`);
  console.log(`Skipped (no HTML):  ${skipped}`);
  console.log(`Errors:             ${errors}`);
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 This was a DRY RUN. To apply changes, run:");
    console.log("   DRY_RUN=false node scripts/clean-all-descriptions.js\n");
  } else {
    console.log("✅ All descriptions have been cleaned!\n");
  }
}

main().catch((err) => {
  console.error("\n❌ Script failed:", err.message);
  process.exit(1);
});
