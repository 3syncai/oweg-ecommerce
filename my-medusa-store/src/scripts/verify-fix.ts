// // // import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

export default async function verifyFix({ container }: any) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("✅ Connected to database\n");

    // Count orders
    const orderCount = await client.query(
      `SELECT COUNT(*) as count FROM "order"`
    );
    console.log(`📦 Total orders: ${orderCount.rows[0].count}`);

    // Count payment collections
    const pcCount = await client.query(
      `SELECT COUNT(*) as count FROM "payment_collection"`
    );
    console.log(`💳 Payment collections: ${pcCount.rows[0].count}`);

    // Count order_payment_collection links
    const opcCount = await client.query(
      `SELECT COUNT(*) as count FROM "order_payment_collection"`
    );
    console.log(`🔗 Order-Payment links: ${opcCount.rows[0].count}`);

    // Count fulfillments
    const fCount = await client.query(
      `SELECT COUNT(*) as count FROM "fulfillment"`
    );
    console.log(`📦 Fulfillments: ${fCount.rows[0].count}`);

    // Count order_fulfillment links
    const ofCount = await client.query(
      `SELECT COUNT(*) as count FROM "order_fulfillment"`
    );
    console.log(`🔗 Order-Fulfillment links: ${ofCount.rows[0].count}`);

    // Check orders without payment collections
    const ordersWithoutPC = await client.query(`
      SELECT COUNT(*) as count
      FROM "order" o
      WHERE NOT EXISTS (
        SELECT 1 FROM "order_payment_collection" opc WHERE opc.order_id = o.id
      )
    `);
    console.log(
      `\n⚠️  Orders without payment collection: ${ordersWithoutPC.rows[0].count}`
    );

    // Check orders without fulfillments
    const ordersWithoutF = await client.query(`
      SELECT COUNT(*) as count
      FROM "order" o
      WHERE NOT EXISTS (
        SELECT 1 FROM "order_fulfillment" of WHERE of.order_id = o.id
      )
    `);
    console.log(
      `⚠️  Orders without fulfillment: ${ordersWithoutF.rows[0].count}\n`
    );
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  } finally {
    await client.end();
  }
}

