// // import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

/**
 * Flush all orders and related data from Medusa database
 * This deletes:
 * - order_line_item
 * - order_item
 * - order
 * - order_address (addresses used by orders, not customer_address)
 *
 * WARNING: This will delete ALL orders. Use with caution!
 */
export default async function flushOrders({ container }: any) {
  console.log("🗑️  Starting order flush...");

  // Get database connection from environment
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("✅ Connected to database");

    // Start transaction
    await client.query("BEGIN");

    try {
      // Step 1: Delete order_line_item (references order_item via totals_id)
      console.log("🗑️  Deleting order_line_item entries...");
      const lineItemResult = await client.query(
        'DELETE FROM "order_line_item"'
      );
      console.log(`   ✅ Deleted ${lineItemResult.rowCount} line items`);

      // Step 2: Delete order_item (references order via order_id)
      console.log("🗑️  Deleting order_item entries...");
      const orderItemResult = await client.query('DELETE FROM "order_item"');
      console.log(`   ✅ Deleted ${orderItemResult.rowCount} order items`);

      // Step 3: Get order_address IDs that are referenced by orders before deleting orders
      console.log("🔍 Finding order addresses...");
      const addressResult = await client.query(`
        SELECT DISTINCT billing_address_id, shipping_address_id 
        FROM "order" 
        WHERE billing_address_id IS NOT NULL OR shipping_address_id IS NOT NULL
      `);

      const addressIds = new Set<string>();
      addressResult.rows.forEach((row) => {
        if (row.billing_address_id) addressIds.add(row.billing_address_id);
        if (row.shipping_address_id) addressIds.add(row.shipping_address_id);
      });

      // Step 4: Delete orders
      console.log("🗑️  Deleting orders...");
      const orderResult = await client.query('DELETE FROM "order"');
      console.log(`   ✅ Deleted ${orderResult.rowCount} orders`);

      // Step 5: Delete order_address entries (only those used by orders)
      if (addressIds.size > 0) {
        console.log(`🗑️  Deleting ${addressIds.size} order addresses...`);
        const addressIdsArray = Array.from(addressIds);
        const placeholders = addressIdsArray
          .map((_, i) => `$${i + 1}`)
          .join(", ");
        const addressDeleteResult = await client.query(
          `DELETE FROM "order_address" WHERE id IN (${placeholders})`,
          addressIdsArray
        );
        console.log(
          `   ✅ Deleted ${addressDeleteResult.rowCount} order addresses`
        );
      } else {
        console.log("   ℹ️  No order addresses to delete");
      }

      // Commit transaction
      await client.query("COMMIT");
      console.log("✅ Transaction committed");

      console.log("\n🎉 Order flush complete!");
      console.log(`   - Deleted ${orderResult.rowCount} orders`);
      console.log(`   - Deleted ${orderItemResult.rowCount} order items`);
      console.log(`   - Deleted ${lineItemResult.rowCount} line items`);
      console.log(`   - Deleted ${addressIds.size} order addresses`);
    } catch (error) {
      // Rollback on error
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("❌ Error flushing orders:", error);
    throw error;
  } finally {
    await client.end();
    console.log("✅ Database connection closed");
  }
}

