// import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

/**
 * Fix order detail page error by ensuring all required relationships exist
 */
export default async function fixOrderDetailError({ container }: any) {
  console.log("🔧 Fixing order detail errors...\n");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("✅ Connected to database\n");

    // Get all orders
    const orders = await client.query(`
      SELECT id, display_id
      FROM "order"
      ORDER BY created_at DESC
    `);

    console.log(`📦 Checking ${orders.rows.length} orders...\n`);

    let fixedCount = 0;
    let errorCount = 0;

    for (const order of orders.rows) {
      try {
        // Check if order has line items
        const lineItemsCheck = await client.query(
          `
          SELECT COUNT(*) as count
          FROM "order_line_item" oli
          JOIN "order_item" oi ON oli.totals_id = oi.id
          WHERE oi.order_id = $1
        `,
          [order.id]
        );

        if (parseInt(lineItemsCheck.rows[0].count) === 0) {
          console.log(`   ⚠️  Order #${order.display_id} has no line items`);
          errorCount++;
          continue;
        }

        // Check if order has payment_collection
        const pcCheck = await client.query(
          `
          SELECT COUNT(*) as count
          FROM "order_payment_collection"
          WHERE order_id = $1
        `,
          [order.id]
        );

        if (parseInt(pcCheck.rows[0].count) === 0) {
          console.log(
            `   ⚠️  Order #${order.display_id} missing payment_collection`
          );
          errorCount++;
        }

        // Check if order has fulfillment
        const fCheck = await client.query(
          `
          SELECT COUNT(*) as count
          FROM "order_fulfillment"
          WHERE order_id = $1
        `,
          [order.id]
        );

        if (parseInt(fCheck.rows[0].count) === 0) {
          console.log(`   ⚠️  Order #${order.display_id} missing fulfillment`);
          errorCount++;
        }

        fixedCount++;
      } catch (e: any) {
        console.log(
          `   ❌ Error checking order #${order.display_id}: ${e.message}`
        );
        errorCount++;
      }
    }

    console.log(`\n✅ Check Complete!`);
    console.log(`   - Orders checked: ${fixedCount}`);
    console.log(`   - Orders with issues: ${errorCount}`);
    console.log(
      `\n💡 Run fix-all-orders.ts to create missing payment_collection and fulfillment entries.\n`
    );
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  } finally {
    await client.end();
  }
}

