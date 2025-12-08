// import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

/**
 * Comprehensive fix for all order issues:
 * 1. Fix incorrect prices (raw_unit_price)
 * 2. Create payment_collection entries
 * 3. Create fulfillment entries
 */
export default async function fixAllIssues({ container }: any) {
  console.log("🔧 Fixing all order issues...\n");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("✅ Connected to database\n");

    // STEP 1: Fix prices
    console.log("📊 Step 1: Fixing prices...\n");
    const lineItems = await client.query(`
      SELECT id, unit_price, raw_unit_price
      FROM "order_line_item"
      ORDER BY created_at DESC
    `);

    let priceFixedCount = 0;
    for (const item of lineItems.rows) {
      const originalPrice = item.unit_price / 100;
      const correctRawUnitPrice = Math.round(originalPrice * 1000);

      // Fix if raw_unit_price is way off (more than 100x difference)
      if (
        item.raw_unit_price > correctRawUnitPrice * 100 ||
        item.raw_unit_price < correctRawUnitPrice * 0.1
      ) {
        await client.query(
          `UPDATE "order_line_item" 
           SET raw_unit_price = $1, updated_at = NOW()
           WHERE id = $2`,
          [correctRawUnitPrice, item.id]
        );
        priceFixedCount++;
      }
    }
    console.log(`   ✅ Fixed ${priceFixedCount} line item prices\n`);

    // STEP 2: Get default location
    let defaultLocationId: string | null = null;
    try {
      const locationResult = await client.query(`
        SELECT id FROM "stock_location" 
        ORDER BY created_at ASC 
        LIMIT 1
      `);
      if (locationResult.rows.length > 0) {
        defaultLocationId = locationResult.rows[0].id;
      }
    } catch (e) {
      // Ignore
    }

    // STEP 3: Fix payment_collection and fulfillment
    console.log("💳 Step 2: Fixing payment_collection and fulfillment...\n");
    const orders = await client.query(`
      SELECT 
        id, display_id, status, metadata, currency_code,
        (metadata->>'payment_status')::text as payment_status,
        (metadata->>'fulfillment_status')::text as fulfillment_status,
        (metadata->'totals'->>'total')::numeric as total_amount
      FROM "order"
      ORDER BY created_at DESC
    `);

    let paymentCount = 0;
    let fulfillmentCount = 0;

    for (const order of orders.rows) {
      // Fix payment_collection
      const existingPC = await client.query(
        `SELECT payment_collection_id FROM "order_payment_collection" WHERE order_id = $1 LIMIT 1`,
        [order.id]
      );

      if (existingPC.rows.length === 0) {
        const paymentStatus = order.payment_status || "awaiting";
        let collectionStatus = "not_paid";
        if (paymentStatus === "captured") {
          collectionStatus = "authorized";
        } else if (paymentStatus === "awaiting") {
          collectionStatus = "awaiting";
        }

        const paymentId = generateId();
        const now = new Date();

        // Get order total from metadata
        let orderTotal = 0;
        try {
          const metadata =
            typeof order.metadata === "string"
              ? JSON.parse(order.metadata)
              : order.metadata || {};
          const totals = metadata.totals || {};
          if (totals.total) {
            orderTotal = Math.round(parseFloat(totals.total));
          }
        } catch (e) {
          if (order.total_amount) {
            orderTotal = Math.round(parseFloat(order.total_amount) * 100);
          }
        }
        if (orderTotal === 0) orderTotal = 1;

        try {
          await client.query(
            `INSERT INTO "payment_collection" 
             (id, amount, status, currency_code, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              paymentId,
              orderTotal,
              collectionStatus,
              order.currency_code,
              now,
              now,
            ]
          );

          const joinPaymentId = generateId();
          await client.query(
            `INSERT INTO "order_payment_collection" 
             (id, order_id, payment_collection_id) 
             VALUES ($1, $2, $3)`,
            [joinPaymentId, order.id, paymentId]
          );
          paymentCount++;
        } catch (e: any) {
          // Ignore errors
        }
      }

      // Fix fulfillment
      const existingF = await client.query(
        `SELECT fulfillment_id FROM "order_fulfillment" WHERE order_id = $1 LIMIT 1`,
        [order.id]
      );

      if (existingF.rows.length === 0 && defaultLocationId) {
        const fulfillmentStatus = order.fulfillment_status || "not_fulfilled";
        let medusaStatus = "not_fulfilled";
        if (fulfillmentStatus === "fulfilled") {
          medusaStatus = "fulfilled";
        } else if (fulfillmentStatus === "shipped") {
          medusaStatus = "shipped";
        }

        const fulfillmentId = generateId();
        const now = new Date();

        try {
          await client.query(
            `INSERT INTO "fulfillment" 
             (id, location_id, status, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5)`,
            [fulfillmentId, defaultLocationId, medusaStatus, now, now]
          );

          const joinFulfillmentId = generateId();
          await client.query(
            `INSERT INTO "order_fulfillment" 
             (id, order_id, fulfillment_id) 
             VALUES ($1, $2, $3)`,
            [joinFulfillmentId, order.id, fulfillmentId]
          );
          fulfillmentCount++;
        } catch (e: any) {
          // Ignore errors
        }
      }
    }

    console.log(`   ✅ Created ${paymentCount} payment collections`);
    console.log(`   ✅ Created ${fulfillmentCount} fulfillments\n`);

    console.log(`\n✅ All fixes complete!`);
    console.log(`   - Prices fixed: ${priceFixedCount}`);
    console.log(`   - Payment collections: ${paymentCount}`);
    console.log(`   - Fulfillments: ${fulfillmentCount}`);
    console.log(`\n💡 Refresh Medusa Admin to see the changes.\n`);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
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

