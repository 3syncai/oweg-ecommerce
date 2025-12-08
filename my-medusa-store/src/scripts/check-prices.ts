// import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

export default async function checkPrices({ container }: any) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("✅ Connected to database\n");

    // Get sample line items with order info
    const result = await client.query(`
      SELECT 
        oli.id,
        oli.title,
        oli.unit_price,
        oli.raw_unit_price,
        oi.quantity,
        oi.raw_quantity,
        o.display_id as order_number
      FROM "order_line_item" oli
      JOIN "order_item" oi ON oli.totals_id = oi.id
      JOIN "order" o ON oi.order_id = o.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `);

    console.log("📊 Sample Line Items:\n");
    result.rows.forEach((item: any) => {
      const origPrice = item.unit_price / 100;
      const expectedRaw = Math.round(origPrice * 1000);
      const lineTotal =
        (item.raw_unit_price / 1000) * (item.raw_quantity / 1000);
      const correctLineTotal = origPrice * item.quantity;

      console.log(
        `Order #${item.order_number}: ${item.title.substring(0, 40)}`
      );
      console.log(
        `  unit_price: ${item.unit_price} (${origPrice.toFixed(2)} original)`
      );
      console.log(
        `  raw_unit_price: ${
          item.raw_unit_price
        } (expected: ${expectedRaw}, diff: ${
          item.raw_unit_price - expectedRaw
        })`
      );
      console.log(
        `  quantity: ${item.quantity}, raw_quantity: ${item.raw_quantity}`
      );
      console.log(`  Current line total: ${lineTotal.toFixed(2)}`);
      console.log(`  Correct line total: ${correctLineTotal.toFixed(2)}`);
      console.log("");
    });
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  } finally {
    await client.end();
  }
}

