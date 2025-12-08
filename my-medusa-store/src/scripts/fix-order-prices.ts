// import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

/**
 * Fix incorrect prices in order_line_item table
 * The issue: raw_unit_price was calculated from unit_price (already in cents) * 1000
 * This caused prices to be 100,000x too large
 * Fix: Recalculate raw_unit_price from original price (unit_price / 100) * 1000
 */
export default async function fixOrderPrices({ container }: any) {
  console.log("🔧 Fixing order prices...\n");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("✅ Connected to database\n");

    // Get all line items
    const lineItems = await client.query(`
      SELECT id, unit_price, raw_unit_price
      FROM "order_line_item"
      ORDER BY created_at DESC
    `);

    console.log(`📦 Found ${lineItems.rows.length} line items to check...\n`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const item of lineItems.rows) {
      // unit_price is in cents, so original price = unit_price / 100
      const originalPrice = item.unit_price / 100;
      // raw_unit_price should be original_price * 1000 (thousandths)
      const correctRawUnitPrice = Math.round(originalPrice * 1000);

      // Check if raw_unit_price is way too large (likely calculated from cents * 1000 instead of original * 1000)
      // If raw_unit_price is more than 100x the expected value, it's definitely wrong
      const isWrong =
        item.raw_unit_price > correctRawUnitPrice * 100 ||
        item.raw_unit_price < correctRawUnitPrice * 0.1;

      if (isWrong) {
        await client.query(
          `UPDATE "order_line_item" 
           SET raw_unit_price = $1, updated_at = NOW()
           WHERE id = $2`,
          [correctRawUnitPrice, item.id]
        );
        fixedCount++;
        if (fixedCount % 10 === 0) {
          console.log(`   ✅ Fixed ${fixedCount} line items...`);
        }
      } else {
        skippedCount++;
      }
    }

    console.log(`\n✅ Fix Complete!`);
    console.log(`   - Fixed: ${fixedCount}`);
    console.log(`   - Skipped (already correct): ${skippedCount}`);
    console.log(`\n💡 Refresh Medusa Admin to see corrected prices.\n`);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  } finally {
    await client.end();
  }
}
