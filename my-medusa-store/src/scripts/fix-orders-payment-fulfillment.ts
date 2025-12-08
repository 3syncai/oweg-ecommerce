// // import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { Client } from "pg";

/**
 * Fix orders by creating payment_collection and fulfillment entries using Medusa services
 */
export default async function fixOrdersPaymentFulfillment({
  container,
}: any) {
  console.log(
    "🔧 Fixing orders - creating payment_collection and fulfillment entries...\n"
  );

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("✅ Connected to database\n");

    // Get all orders with their metadata
    const ordersResult = await client.query(`
      SELECT 
        id, display_id, status, metadata,
        (metadata->>'payment_status')::text as payment_status,
        (metadata->>'fulfillment_status')::text as fulfillment_status
      FROM "order"
      ORDER BY created_at DESC
    `);

    console.log(`📦 Found ${ordersResult.rows.length} orders to process\n`);

    // Check if payment_collection table exists
    const paymentTableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'payment_collection'
    `);

    const hasPaymentCollection = paymentTableCheck.rows.length > 0;

    // Check if fulfillment table exists
    const fulfillmentTableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'fulfillment'
    `);

    const hasFulfillment = fulfillmentTableCheck.rows.length > 0;

    console.log(`📋 Tables:`);
    console.log(`   payment_collection: ${hasPaymentCollection ? "✅" : "❌"}`);
    console.log(`   fulfillment: ${hasFulfillment ? "✅" : "❌"}\n`);

    if (!hasPaymentCollection && !hasFulfillment) {
      console.log(
        "⚠️  Neither payment_collection nor fulfillment tables exist."
      );
      console.log(
        "   Medusa Admin might be reading status from metadata or other sources."
      );
      console.log("   The issue might be with how metadata is formatted.\n");
      return;
    }

    let paymentFixed = 0;
    let fulfillmentFixed = 0;

    // Try using Medusa services first
    try {
      if (hasPaymentCollection) {
        const paymentModuleService = container.resolve(Modules.PAYMENT);
        console.log("💳 Using Payment Module Service...\n");
      }
    } catch (e) {
      console.log(
        "⚠️  Payment module service not available, using direct DB\n"
      );
    }

    try {
      if (hasFulfillment) {
        const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
        console.log("📦 Using Fulfillment Module Service...\n");
      }
    } catch (e) {
      console.log(
        "⚠️  Fulfillment module service not available, using direct DB\n"
      );
    }

    // Use direct database insertion
    for (const order of ordersResult.rows) {
      // Create payment_collection entry
      if (hasPaymentCollection) {
        const paymentCheck = await client.query(
          `SELECT id FROM "payment_collection" WHERE order_id = $1 LIMIT 1`,
          [order.id]
        );

        if (paymentCheck.rows.length === 0) {
          // Get payment status from metadata
          const paymentStatus = order.payment_status || "awaiting";

          // Map payment status to Medusa payment_collection status
          let collectionStatus = "not_paid";
          if (paymentStatus === "captured") {
            collectionStatus = "authorized";
          } else if (paymentStatus === "awaiting") {
            collectionStatus = "awaiting";
          } else if (paymentStatus === "canceled") {
            collectionStatus = "canceled";
          }

          // Get payment_collection table structure
          const paymentCols = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'payment_collection'
            ORDER BY ordinal_position
          `);

          const paymentId = generateId();
          const now = new Date();

          // Build insert statement
          const requiredCols: string[] = [];
          const values: any[] = [];
          let paramIndex = 1;

          // Check for required columns
          const colMap = new Map(
            paymentCols.rows.map((r: any) => [r.column_name, r])
          );

          if (colMap.has("id")) {
            requiredCols.push("id");
            values.push(paymentId);
            paramIndex++;
          }

          if (colMap.has("order_id")) {
            requiredCols.push("order_id");
            values.push(order.id);
            paramIndex++;
          }

          if (colMap.has("status")) {
            requiredCols.push("status");
            values.push(collectionStatus);
            paramIndex++;
          }

          if (colMap.has("created_at")) {
            requiredCols.push("created_at");
            values.push(now);
            paramIndex++;
          }

          if (colMap.has("updated_at")) {
            requiredCols.push("updated_at");
            values.push(now);
            paramIndex++;
          }

          // Add currency_code if exists
          if (colMap.has("currency_code")) {
            const orderCurrency = await client.query(
              `SELECT currency_code FROM "order" WHERE id = $1`,
              [order.id]
            );
            if (orderCurrency.rows.length > 0) {
              requiredCols.push("currency_code");
              values.push(orderCurrency.rows[0].currency_code);
              paramIndex++;
            }
          }

          if (requiredCols.length > 0) {
            const placeholders = requiredCols
              .map((_, i) => `$${i + 1}`)
              .join(", ");
            await client.query(
              `INSERT INTO "payment_collection" (${requiredCols
                .map((c) => `"${c}"`)
                .join(", ")}) VALUES (${placeholders})`,
              values
            );
            paymentFixed++;
            if (paymentFixed % 10 === 0) {
              console.log(
                `   ✅ Created ${paymentFixed} payment collections...`
              );
            }
          }
        }
      }

      // Create fulfillment entry
      if (hasFulfillment) {
        const fulfillmentCheck = await client.query(
          `SELECT id FROM "fulfillment" WHERE order_id = $1 LIMIT 1`,
          [order.id]
        );

        if (fulfillmentCheck.rows.length === 0) {
          // Get fulfillment status from metadata
          const fulfillmentStatus = order.fulfillment_status || "not_fulfilled";

          // Map fulfillment status to Medusa fulfillment status
          let medusaFulfillmentStatus = "not_fulfilled";
          if (fulfillmentStatus === "fulfilled") {
            medusaFulfillmentStatus = "fulfilled";
          } else if (fulfillmentStatus === "shipped") {
            medusaFulfillmentStatus = "shipped";
          } else if (fulfillmentStatus === "partially_fulfilled") {
            medusaFulfillmentStatus = "partially_fulfilled";
          }

          // Get fulfillment table structure
          const fulfillmentCols = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'fulfillment'
            ORDER BY ordinal_position
          `);

          const fulfillmentId = generateId();
          const now = new Date();

          // Build insert statement
          const requiredCols: string[] = [];
          const values: any[] = [];
          let paramIndex = 1;

          // Check for required columns
          const colMap = new Map(
            fulfillmentCols.rows.map((r: any) => [r.column_name, r])
          );

          if (colMap.has("id")) {
            requiredCols.push("id");
            values.push(fulfillmentId);
            paramIndex++;
          }

          if (colMap.has("order_id")) {
            requiredCols.push("order_id");
            values.push(order.id);
            paramIndex++;
          }

          if (colMap.has("status")) {
            requiredCols.push("status");
            values.push(medusaFulfillmentStatus);
            paramIndex++;
          }

          if (colMap.has("created_at")) {
            requiredCols.push("created_at");
            values.push(now);
            paramIndex++;
          }

          if (colMap.has("updated_at")) {
            requiredCols.push("updated_at");
            values.push(now);
            paramIndex++;
          }

          if (requiredCols.length > 0) {
            const placeholders = requiredCols
              .map((_, i) => `$${i + 1}`)
              .join(", ");
            await client.query(
              `INSERT INTO "fulfillment" (${requiredCols
                .map((c) => `"${c}"`)
                .join(", ")}) VALUES (${placeholders})`,
              values
            );
            fulfillmentFixed++;
            if (fulfillmentFixed % 10 === 0) {
              console.log(`   ✅ Created ${fulfillmentFixed} fulfillments...`);
            }
          }
        }
      }
    }

    console.log(`\n✅ Fix Complete!`);
    console.log(`   - Payment collections created: ${paymentFixed}`);
    console.log(`   - Fulfillments created: ${fulfillmentFixed}`);
    console.log(
      `\n💡 Refresh Medusa Admin to see updated payment and fulfillment statuses.`
    );
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await client.end();
  }
}

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

