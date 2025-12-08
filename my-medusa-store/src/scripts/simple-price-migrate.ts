import mysql from "mysql2/promise";

/**
 * Simple Price Migration Script: OpenCart → Medusa
 * 
 * This script reads prices from OpenCart and updates them in Medusa using the Admin API.
 * 
 * Usage:
 *   npx tsx ./src/scripts/simple-price-migrate.ts --dry-run    # Preview
 *   npx tsx ./src/scripts/simple-price-migrate.ts              # Apply
 */

// Configuration
const OPENCART_CONFIG = {
  host: process.env.OPENCART_DB_HOST || "147.93.31.253",
  port: parseInt(process.env.OPENCART_DB_PORT || "3306"),
  user: process.env.OPENCART_DB_USER || "oweg_user2",
  password: process.env.OPENCART_DB_PASSWORD || "Oweg#@123",
  database: process.env.OPENCART_DB_NAME || "oweg_db",
};

const MEDUSA_ADMIN_URL = process.env.MEDUSA_ADMIN_URL || "http://localhost:9000";
const MEDUSA_API_KEY = process.env.MEDUSA_API_KEY || "";

type OpenCartPrice = {
  product_id: number;
  name: string;
  base_price: number;
  special_price: number | null;
};

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(`\n🔄 Starting Price Migration (${isDryRun ? "DRY RUN" : "LIVE"})\n`);

  let mysqlConnection: mysql.Connection | null = null;
  let stats = { total: 0, matched: 0, updated: 0, errors: 0 };

  try {
    // Connect to OpenCart
    console.log("📡 Connecting to OpenCart MySQL...");
    mysqlConnection = await mysql.createConnection(OPENCART_CONFIG);
    console.log("✅ Connected\n");

    // Fetch prices from OpenCart
    console.log("📊 Fetching prices from OpenCart...");
    const [rows] = await mysqlConnection.execute<mysql.RowDataPacket[]>(`
      SELECT 
        p.product_id,
        pd.name,
        p.price as base_price,
        (
          SELECT ps.price FROM oc_product_special ps
          WHERE ps.product_id = p.product_id
            AND (ps.date_start = '0000-00-00' OR ps.date_start <= NOW())
            AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
          ORDER BY ps.priority ASC, ps.price ASC
          LIMIT 1
        ) AS special_price
      FROM oc_product p
      INNER JOIN oc_product_description pd 
        ON p.product_id = pd.product_id AND pd.language_id = 1
      WHERE p.price > 0
      ORDER BY p.product_id
    `);

    const ocPrices: OpenCartPrice[] = rows.map(row => ({
      product_id: Number(row.product_id),
      name: String(row.name),
      base_price: parseFloat(String(row.base_price || "0")),
      special_price: row.special_price ? parseFloat(String(row.special_price)) : null,
    }));

    stats.total = ocPrices.length;
    console.log(`✅ Found ${ocPrices.length} products\n`);

    // Fetch Medusa products
    console.log("🔍 Fetching Medusa products...");
    const medusaProducts = await fetchMedusaProducts();
    console.log(`✅ Found ${medusaProducts.length} Medusa products\n`);

    // Match and update
    console.log("🔄 Matching and updating prices...\n");
    
    for (const ocPrice of ocPrices) {
      // Match by opencart_id or name
      const medusaProduct = medusaProducts.find(p => {
        const metadata = p.metadata || {};
        if (metadata.opencart_id && String(metadata.opencart_id) === String(ocPrice.product_id)) {
          return true;
        }
        return p.title?.toLowerCase().trim() === ocPrice.name.toLowerCase().trim();
      });

      if (!medusaProduct || !medusaProduct.variants?.[0]) {
        continue;
      }

      stats.matched++;
      const variant = medusaProduct.variants[0];
      const priceInCents = Math.round(ocPrice.base_price * 100);

      if (isDryRun) {
        if (stats.matched <= 20) {
          const discount = ocPrice.special_price 
            ? ` (-${Math.round((1 - ocPrice.special_price / ocPrice.base_price) * 100)}%)`
            : "";
          console.log(`${ocPrice.name.slice(0, 40)} → ₹${ocPrice.base_price}${discount}`);
        }
        continue;
      }

      // Update price via API
      try {
        await updateVariantPrice(variant.id, priceInCents);
        stats.updated++;
        
        if (stats.updated % 50 === 0) {
          console.log(`✅ Updated ${stats.updated}/${stats.matched}...`);
        }
      } catch (error) {
        console.error(`❌ Failed: ${ocPrice.name}`);
        stats.errors++;
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📈 MigrationSummary");
    console.log("=".repeat(60));
    console.log(`Total OpenCart products: ${stats.total}`);
    console.log(`Matched with Medusa:     ${stats.matched}`);
    if (!isDryRun) {
      console.log(`Successfully updated:    ${stats.updated}`);
      console.log(`Errors:                  ${stats.errors}`);
    }
    console.log("=".repeat(60) + "\n");

    if (isDryRun) {
      console.log("ℹ️  This was a DRY RUN. Run without --dry-run to apply.\n");
    } else {
      console.log("✅ Migration complete!\n");
    }

  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  } finally {
    if (mysqlConnection) {
      await mysqlConnection.end();
    }
  }
}

async function fetchMedusaProducts() {
  const products: any[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${MEDUSA_ADMIN_URL}/admin/products?limit=${limit}&offset=${offset}&fields=id,title,metadata,variants.id,variants.prices`;
    const res = await fetch(url, {
      headers: MEDUSA_API_KEY ? { "x-medusa-access-token": MEDUSA_API_KEY } : {},
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch Medusa products: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.products?.length) break;

    products.push(...data.products);
    offset += limit;

    if (data.products.length < limit) break;
  }

  return products;
}

async function updateVariantPrice(variantId: string, amountInCents: number) {
  const url = `${MEDUSA_ADMIN_URL}/admin/products/variants/${variantId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(MEDUSA_API_KEY ? { "x-medusa-access-token": MEDUSA_API_KEY } : {}),
    },
    body: JSON.stringify({
      prices: [{
        currency_code: "inr",
        amount: amountInCents,
      }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to update variant ${variantId}: ${res.statusText}`);
  }
}

main();
