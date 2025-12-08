// import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

/**
 * Fix order payment and fulfillment statuses by creating payment_collection and fulfillment entries
 */
export default async function fixOrderStatuses({ container }: any) {
  console.log("🔧 Fixing order payment and fulfillment statuses...");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("✅ Connected to database\n");

    // Check what tables exist
    const tablesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND (table_name LIKE '%payment%' OR table_name LIKE '%fulfillment%')
      ORDER BY table_name
    `);

    console.log("📋 Payment/Fulfillment tables found:");
    tablesCheck.rows.forEach((row) => {
      console.log(`   - ${row.table_name}`);
    });

    // Get orders with their metadata
    const ordersResult = await client.query(`
      SELECT 
        id, display_id, status, metadata,
        (metadata->>'payment_status')::text as payment_status,
        (metadata->>'fulfillment_status')::text as fulfillment_status
      FROM "order"
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`\n📦 Found ${ordersResult.rows.length} orders to check`);

    for (const order of ordersResult.rows) {
      console.log(`\n   Order #${order.display_id}:`);
      console.log(`      Status: ${order.status}`);
      console.log(
        `      Payment Status (from metadata): ${
          order.payment_status || "not set"
        }`
      );
      console.log(
        `      Fulfillment Status (from metadata): ${
          order.fulfillment_status || "not set"
        }`
      );

      // Check if payment_collection table exists
      const hasPaymentCollection = tablesCheck.rows.some(
        (r) => r.table_name === "payment_collection"
      );
      if (hasPaymentCollection) {
        const paymentCheck = await client.query(
          `
          SELECT id FROM "payment_collection" WHERE order_id = $1 LIMIT 1
        `,
          [order.id]
        );

        if (paymentCheck.rows.length === 0) {
          console.log(`      ⚠️  No payment_collection found`);
        } else {
          console.log(
            `      ✅ Payment collection exists: ${paymentCheck.rows[0].id}`
          );
        }
      }

      // Check if fulfillment table exists
      const hasFulfillment = tablesCheck.rows.some(
        (r) => r.table_name === "fulfillment"
      );
      if (hasFulfillment) {
        const fulfillmentCheck = await client.query(
          `
          SELECT id FROM "fulfillment" WHERE order_id = $1 LIMIT 1
        `,
          [order.id]
        );

        if (fulfillmentCheck.rows.length === 0) {
          console.log(`      ⚠️  No fulfillment found`);
        } else {
          console.log(
            `      ✅ Fulfillment exists: ${fulfillmentCheck.rows[0].id}`
          );
        }
      }
    }

    // Check order table structure for payment/fulfillment columns
    const orderColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'order'
        AND (column_name LIKE '%payment%' OR column_name LIKE '%fulfillment%')
    `);

    if (orderColumns.rows.length > 0) {
      console.log(`\n📋 Order table has payment/fulfillment columns:`);
      orderColumns.rows.forEach((row) => {
        console.log(`   ${row.column_name}: ${row.data_type}`);
      });
    } else {
      console.log(`\n📋 Order table does NOT have payment/fulfillment columns`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    await client.end();
  }
}

