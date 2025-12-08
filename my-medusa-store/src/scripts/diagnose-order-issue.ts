// import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

/**
 * Diagnose order issues - check what's missing or incorrect
 */
export default async function diagnoseOrderIssue({ container }: any) {
  console.log("🔍 Diagnosing order issues...");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("✅ Connected to database\n");

    // Get a sample order
    const orderResult = await client.query(`
      SELECT 
        id, display_id, email, status, metadata,
        billing_address_id, shipping_address_id, customer_id, region_id
      FROM "order"
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (orderResult.rows.length === 0) {
      console.log("❌ No orders found");
      return;
    }

    const order = orderResult.rows[0];
    console.log("📦 Sample Order:");
    console.log(`   ID: ${order.id}`);
    console.log(`   Display ID: ${order.display_id}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Metadata: ${JSON.stringify(order.metadata, null, 2)}\n`);

    // Check order_item
    const orderItemResult = await client.query(
      `
      SELECT COUNT(*) as count
      FROM "order_item"
      WHERE order_id = $1
    `,
      [order.id]
    );

    console.log(`📊 Order Items: ${orderItemResult.rows[0].count}`);

    // Check order_line_item
    const lineItemResult = await client.query(
      `
      SELECT COUNT(*) as count
      FROM "order_line_item"
      WHERE totals_id IN (
        SELECT id FROM "order_item" WHERE order_id = $1
      )
    `,
      [order.id]
    );

    console.log(`📊 Line Items: ${lineItemResult.rows[0].count}`);

    // Check for payment_collection table
    const paymentTableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE '%payment%'
    `);

    console.log(`\n💳 Payment-related tables:`);
    paymentTableCheck.rows.forEach((row) => {
      console.log(`   - ${row.table_name}`);
    });

    // Check for fulfillment table
    const fulfillmentTableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE '%fulfillment%'
    `);

    console.log(`\n📦 Fulfillment-related tables:`);
    fulfillmentTableCheck.rows.forEach((row) => {
      console.log(`   - ${row.table_name}`);
    });

    // Check order table columns
    const orderColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'order'
      ORDER BY ordinal_position
    `);

    console.log(`\n📋 Order table columns:`);
    orderColumns.rows.forEach((row) => {
      console.log(
        `   ${row.column_name}: ${row.data_type} (${
          row.is_nullable === "YES" ? "nullable" : "NOT NULL"
        })`
      );
    });

    // Check if there are foreign keys to payment/fulfillment tables
    const fkCheck = await client.query(`
      SELECT 
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'order'
    `);

    console.log(`\n🔗 Foreign keys from order table:`);
    fkCheck.rows.forEach((row) => {
      console.log(
        `   ${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`
      );
    });
  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    await client.end();
  }
}

