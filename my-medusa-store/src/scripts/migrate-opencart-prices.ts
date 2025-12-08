import mysql from "mysql2/promise";
// Medusa v2 script - container injected at runtime

/**
 * Price Migration Script: OpenCart → Medusa
 * 
 * This script migrates product prices and discounts from OpenCart MySQL to Medusa PostgreSQL.
 * 
 * Usage:
 *   npm run exec ./src/scripts/migrate-opencart-prices.ts -- --dry-run    # Preview changes
 *   npm run exec ./src/scripts/migrate-opencart-prices.ts                 # Apply changes
 */

// OpenCart MySQL configuration
const OPENCART_CONFIG = {
  host: process.env.OPENCART_DB_HOST || "147.93.31.253",
  port: parseInt(process.env.OPENCART_DB_PORT || "3306"),
  user: process.env.OPENCART_DB_USER || "oweg_user2",
  password: process.env.OPENCART_DB_PASSWORD || "Oweg#@123",
  database: process.env.OPENCART_DB_NAME || "oweg_db",
};

type OpenCartPrice = {
  product_id: number;
  name: string;
  base_price: number;
  special_price: number | null;
  discount_percentage: number;
};

type MedusaProductMatch = {
  medusa_id: string;
  opencart_id: string;
  variant_id: string;
  title: string;
  current_price: number;
  new_base_price: number;
  new_special_price: number | null;
  discount_percentage: number;
};

export default async function migratePrices({ container }: { container: any }) {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(`\n🔄 Starting Price Migration (${isDryRun ? "DRY RUN" : "LIVE"})\n`);

  let mysqlConnection: mysql.Connection | null = null;
  let stats = {
    total: 0,
    matched: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // Connect to OpenCart MySQL
    console.log("📡 Connecting to OpenCart MySQL...");
    mysqlConnection = await mysql.createConnection(OPENCART_CONFIG);
    console.log("✅ Connected to OpenCart\n");

    // Fetch all prices from OpenCart
    console.log("📊 Fetching prices from OpenCart...");
    const openCartPrices = await fetchOpenCartPrices(mysqlConnection);
    stats.total = openCartPrices.length;
    console.log(`✅ Found ${openCartPrices.length} products with prices\n`);

    if (openCartPrices.length === 0) {
      console.log("⚠️  No products found in OpenCart. Exiting.");
      return;
    }

    // Use Medusa container for database operations

    // Match products between OpenCart and Medusa
    console.log("🔍 Matching products between OpenCart and Medusa...");
    const matches = await matchProducts(container, openCartPrices);
    stats.matched = matches.length;
    console.log(`✅ Matched ${matches.length} products\n`);

    if (matches.length === 0) {
      console.log("⚠️  No product matches found. Check metadata or product names.");
      return;
    }

    // Update prices in Medusa
    if (isDryRun) {
      console.log("🔍 DRY RUN - Preview of changes:\n");
      displayChanges(matches);
    } else {
      console.log("💾 Updating prices in Medusa...\n");
      const results = await updateMedusaPrices(container, matches);
      stats.updated = results.updated;
      stats.skipped = results.skipped;
      stats.errors = results.errors;
    }

    // Display summary
    console.log("\n" + "=".repeat(60));
    console.log("📈 Migration Summary");
    console.log("=".repeat(60));
    console.log(`Total OpenCart products: ${stats.total}`);
    console.log(`Matched with Medusa:     ${stats.matched}`);
    if (!isDryRun) {
      console.log(`Successfully updated:    ${stats.updated}`);
      console.log(`Skipped (no change):     ${stats.skipped}`);
      console.log(`Errors:                  ${stats.errors}`);
    }
    console.log("=".repeat(60) + "\n");

    if (isDryRun) {
      console.log("ℹ️  This was a DRY RUN. No changes were made.");
      console.log("ℹ️  Run without --dry-run to apply changes.\n");
    } else {
      console.log("✅ Price migration complete!\n");
    }
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  } finally {
    if (mysqlConnection) {
      await mysqlConnection.end();
      console.log("🔌 Disconnected from OpenCart\n");
    }
  }
}

/**
 * Fetch all product prices from OpenCart
 */
async function fetchOpenCartPrices(
  connection: mysql.Connection
): Promise<OpenCartPrice[]> {
  const [rows] = await connection.execute<mysql.RowDataPacket[]>(
    `
    SELECT 
      p.product_id,
      pd.name,
      p.price as base_price,
      (
        SELECT ps.price
        FROM oc_product_special ps
        WHERE ps.product_id = p.product_id
          AND (ps.date_start = '0000-00-00' OR ps.date_start <= NOW())
          AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
        ORDER BY ps.priority ASC, ps.price ASC
        LIMIT 1
      ) AS special_price
    FROM oc_product p
    INNER JOIN oc_product_description pd 
      ON p.product_id = pd.product_id AND pd.language_id = 1
    WHERE p.price > 0 OR EXISTS (
      SELECT 1 FROM oc_product_special ps2
      WHERE ps2.product_id = p.product_id
        AND ps2.price > 0
    )
    ORDER BY p.product_id
    `
  );

  return rows.map((row) => {
    const basePrice = parseFloat(String(row.base_price || "0"));
    const specialPrice = row.special_price
      ? parseFloat(String(row.special_price))
      : null;
    const discountPercentage =
      specialPrice && basePrice > 0
        ? Math.round(((basePrice - specialPrice) / basePrice) * 100)
        : 0;

    return {
      product_id: Number(row.product_id),
      name: String(row.name),
      base_price: basePrice,
      special_price: specialPrice,
      discount_percentage: discountPercentage,
    };
  });
}

/**
 * Match OpenCart products with Medusa products
 */
async function matchProducts(
  container: any,
  openCartPrices: OpenCartPrice[]
): Promise<MedusaProductMatch[]> {
  const query = container.resolve("query");
  const matches: MedusaProductMatch[] = [];

  try {
    // Fetch all Medusa products using query API
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "title", "metadata", "variants.*", "variants.prices.*"],
    });

    for (const ocProduct of openCartPrices) {
      // Try matching by opencart_id in metadata
      let medusaProduct = products.find((p: any) => {
        const metadata = p.metadata || {};
        const ocId = metadata.opencart_id;
        return ocId && String(ocId) === String(ocProduct.product_id);
      });

      // Fallback: match by product name
      if (!medusaProduct) {
        const normalizedOcName = ocProduct.name.toLowerCase().trim();
        medusaProduct = products.find((p: any) => {
          const normalizedMedusaName = (p.title || "").toLowerCase().trim();
          return normalizedMedusaName === normalizedOcName;
        });
      }

      if (medusaProduct && medusaProduct.variants?.length > 0) {
        const variant = medusaProduct.variants[0];
        const currentPrice = variant.prices?.[0]?.amount || 0;

        matches.push({
          medusa_id: medusaProduct.id,
          opencart_id: String(ocProduct.product_id),
          variant_id: variant.id,
          title: medusaProduct.title,
          current_price: currentPrice / 100, // Convert from cents
          new_base_price: ocProduct.base_price,
          new_special_price: ocProduct.special_price,
          discount_percentage: ocProduct.discount_percentage,
        });
      }
    }

    return matches;
  } catch (error) {
    console.error("Error fetching Medusa products:", error);
    throw error;
  }
}


/**
 * Display changes that will be made
 */
function displayChanges(matches: MedusaProductMatch[]) {
  const changesToShow = matches.slice(0, 20); // Show first 20
  const hasMore = matches.length > 20;

  console.log("Product Name".padEnd(40) + " | Current → New Base | Discount");
  console.log("-".repeat(80));

  for (const match of changesToShow) {
    const title = match.title.slice(0, 38).padEnd(40);
    const prices = `₹${match.current_price} → ₹${match.new_base_price}`.padEnd(20);
    const discount = match.new_special_price
      ? `₹${match.new_special_price} (-${match.discount_percentage}%)`
      : "No discount";

    console.log(`${title} | ${prices} | ${discount}`);
  }

  if (hasMore) {
    console.log(`\n... and ${matches.length - 20} more products`);
  }
}

/**
 * Update prices in Medusa
 */
async function updateMedusaPrices(
  container: any,
  matches: MedusaProductMatch[]
): Promise<{ updated: number; skipped: number; errors: number }> {
  const remoteQuery = container.resolve("remoteQuery");
  const pricingModuleService = container.resolve("pricingModuleService");

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  console.log("📝 Updating variant prices in Medusa...\n");

  // Update each product variant's price
  for (const match of matches) {
    try {
      const priceInCents = Math.round(match.new_base_price * 100);

      // Get existing variant prices
      const existingPrices = await remoteQuery({
        entryPoint: "price",
        fields: ["id", "variant_id", "amount", "currency_code"],
        variables: {
          filters: {
            variant_id: match.variant_id,
            currency_code: "inr",
          },
        },
      });

      if (existingPrices && existingPrices.length > 0) {
        // Update existing price
        await pricingModuleService.updatePrices({
          id: existingPrices[0].id,
          amount: priceInCents,
        });
      } else {
        // Create new price
        await pricingModuleService.createPrices({
          variant_id: match.variant_id,
          currency_code: "inr",
          amount: priceInCents,
        });
      }

      updated++;
      if (updated % 10 === 0) {
        console.log(`✅ Updated ${updated}/${matches.length} products...`);
      }
    } catch (error) {
      console.error(`❌ Failed to update ${match.title}:`, error);
      errors++;
    }
  }

  console.log(`\n✅ Updated ${updated} product prices\n`);

  // Handle discounted prices separately if needed
  const discountedProducts = matches.filter(m => m.new_special_price);
  if (discountedProducts.length > 0) {
    console.log(`\n💡 Note: ${discountedProducts.length} products have special prices (discounts).`);
    console.log(`   You can manually create a price list in Medusa Admin for these discounts.`);
    console.log(`   Or re-run this script after implementing price list support for Medusa v2.\n`);
  }

  return { updated, skipped, errors };
}
