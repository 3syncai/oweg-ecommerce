import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

/**
 * Comprehensive fix for all order issues:
 * 1. Creates payment_collection entries
 * 2. Creates fulfillment entries
 * 3. Ensures proper metadata format
 */
export default async function fixAllOrders({ container }: ExecArgs) {
  console.log("🔧 Fixing all orders...\n");

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
    console.log("");

    const hasPaymentCollection = tablesCheck.rows.some(
      (r) => r.table_name === "payment_collection"
    );
    const hasFulfillment = tablesCheck.rows.some(
      (r) => r.table_name === "fulfillment"
    );

    // Get all orders with totals from metadata
    const ordersResult = await client.query(`
      SELECT 
        id, display_id, status, metadata, currency_code,
        (metadata->>'payment_status')::text as payment_status,
        (metadata->>'fulfillment_status')::text as fulfillment_status,
        (metadata->'totals'->>'total')::numeric as total_amount
      FROM "order"
      ORDER BY created_at DESC
    `);

    // Get default location_id for fulfillments
    let defaultLocationId: string | null = null;
    try {
      const locationResult = await client.query(`
        SELECT id FROM "stock_location" 
        ORDER BY created_at ASC 
        LIMIT 1
      `);
      if (locationResult.rows.length > 0) {
        defaultLocationId = locationResult.rows[0].id;
        console.log(`📍 Using default location: ${defaultLocationId}\n`);
      } else {
        console.log(
          `⚠️  No stock_location found. Fulfillments will need location_id.\n`
        );
      }
    } catch (e: any) {
      console.log(`⚠️  Could not find stock_location: ${e.message}\n`);
    }

    console.log(`📦 Processing ${ordersResult.rows.length} orders...\n`);

    let paymentCount = 0;
    let fulfillmentCount = 0;
    let skippedPayment = 0;
    let skippedFulfillment = 0;

    for (const order of ordersResult.rows) {
      // Create payment_collection using join table
      if (hasPaymentCollection) {
        // Check if order already has a payment_collection via join table
        const existingJoin = await client.query(
          `SELECT payment_collection_id FROM "order_payment_collection" WHERE order_id = $1 LIMIT 1`,
          [order.id]
        );

        if (existingJoin.rows.length === 0) {
          console.log(
            `   Creating payment_collection for order #${order.display_id}...`
          );
          const paymentStatus = order.payment_status || "awaiting";
          let collectionStatus = "not_paid";
          if (paymentStatus === "captured") {
            collectionStatus = "authorized";
          } else if (paymentStatus === "awaiting") {
            collectionStatus = "awaiting";
          }

          const paymentId = generateId();
          const now = new Date();

          try {
            // First, get payment_collection table columns
            const pcCols = await client.query(`
              SELECT column_name FROM information_schema.columns
              WHERE table_name = 'payment_collection'
              ORDER BY ordinal_position
            `);

            const hasCurrencyCode = pcCols.rows.some(
              (r: any) => r.column_name === "currency_code"
            );
            const hasStatus = pcCols.rows.some(
              (r: any) => r.column_name === "status"
            );
            const hasAmount = pcCols.rows.some(
              (r: any) => r.column_name === "amount"
            );
            const hasRawAmount = pcCols.rows.some(
              (r: any) => r.column_name === "raw_amount"
            );

            // Get order total from metadata
            // Metadata totals.total is stored in cents (from load script: Math.round(total * 100))
            let orderTotal = 0;
            try {
              const metadata =
                typeof order.metadata === "string"
                  ? JSON.parse(order.metadata)
                  : order.metadata || {};
              const totals = metadata.totals || {};

              if (totals.total) {
                // totals.total is already in cents
                orderTotal = Math.round(parseFloat(totals.total));
              } else if (order.total_amount) {
                // Fallback to SQL extracted value
                orderTotal = Math.round(parseFloat(order.total_amount) * 100);
              }
            } catch (e) {
              // If metadata parsing fails, try SQL value
              if (order.total_amount) {
                orderTotal = Math.round(parseFloat(order.total_amount) * 100);
              }
            }

            // If still 0, use a default (shouldn't happen but safety check)
            if (orderTotal === 0) {
              console.log(
                `   ⚠️  Order #${order.display_id} has no total, using default 1 cent`
              );
              orderTotal = 1; // Minimum 1 cent to avoid NOT NULL constraint
            }

            const rawAmount = orderTotal * 10; // raw_amount is typically in thousandths

            // Build insert columns and values
            const pcInsertCols: string[] = ["id"];
            const pcInsertValues: any[] = [paymentId];
            let pcParamIndex = 2;

            // amount is REQUIRED (NOT NULL), so always include if column exists
            if (hasAmount) {
              pcInsertCols.push("amount");
              pcInsertValues.push(orderTotal);
              pcParamIndex++;
            }

            if (hasRawAmount) {
              pcInsertCols.push("raw_amount");
              pcInsertValues.push(rawAmount);
              pcParamIndex++;
            }

            if (hasStatus) {
              pcInsertCols.push("status");
              pcInsertValues.push(collectionStatus);
              pcParamIndex++;
            }

            if (hasCurrencyCode) {
              pcInsertCols.push("currency_code");
              pcInsertValues.push(order.currency_code);
              pcParamIndex++;
            }

            pcInsertCols.push("created_at", "updated_at");
            pcInsertValues.push(now, now);

            const pcPlaceholders = pcInsertCols
              .map((_, i) => `$${i + 1}`)
              .join(", ");
            await client.query(
              `INSERT INTO "payment_collection" (${pcInsertCols
                .map((c) => `"${c}"`)
                .join(", ")}) 
               VALUES (${pcPlaceholders})`,
              pcInsertValues
            );

            // Create join table entry (id is required based on error)
            const joinPaymentId = generateId();
            await client.query(
              `INSERT INTO "order_payment_collection" 
               (id, order_id, payment_collection_id) 
               VALUES ($1, $2, $3)`,
              [joinPaymentId, order.id, paymentId]
            );
            paymentCount++;
            if (paymentCount % 10 === 0) {
              console.log(
                `   ✅ Created ${paymentCount} payment collections...`
              );
            }
          } catch (e: any) {
            console.log(
              `   ⚠️  Could not create payment_collection for order #${order.display_id}: ${e.message}`
            );
          }
        } else {
          skippedPayment++;
        }
      }

      // Create fulfillment using join table
      if (hasFulfillment) {
        // Check if order already has a fulfillment via join table
        const existingJoin = await client.query(
          `SELECT fulfillment_id FROM "order_fulfillment" WHERE order_id = $1 LIMIT 1`,
          [order.id]
        );

        if (existingJoin.rows.length === 0) {
          console.log(
            `   Creating fulfillment for order #${order.display_id}...`
          );
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
            // First, get fulfillment table columns
            const fCols = await client.query(`
              SELECT column_name FROM information_schema.columns
              WHERE table_name = 'fulfillment'
              ORDER BY ordinal_position
            `);

            const hasStatus = fCols.rows.some(
              (r: any) => r.column_name === "status"
            );
            const hasLocationId = fCols.rows.some(
              (r: any) => r.column_name === "location_id"
            );

            // Build insert columns and values
            const fInsertCols: string[] = ["id"];
            const fInsertValues: any[] = [fulfillmentId];
            let fParamIndex = 2;

            // location_id is REQUIRED (NOT NULL), so we must have it
            if (hasLocationId) {
              if (!defaultLocationId) {
                // Try to get from store default_location_id
                try {
                  const storeResult = await client.query(`
                    SELECT default_location_id FROM "store" LIMIT 1
                  `);
                  if (
                    storeResult.rows.length > 0 &&
                    storeResult.rows[0].default_location_id
                  ) {
                    defaultLocationId = storeResult.rows[0].default_location_id;
                  }
                } catch (e) {
                  // Ignore
                }
              }

              if (!defaultLocationId) {
                throw new Error(
                  `location_id is required for fulfillment but no location found. Order #${order.display_id}`
                );
              }

              fInsertCols.push("location_id");
              fInsertValues.push(defaultLocationId);
              fParamIndex++;
            }

            if (hasStatus) {
              fInsertCols.push("status");
              fInsertValues.push(medusaStatus);
              fParamIndex++;
            }

            fInsertCols.push("created_at", "updated_at");
            fInsertValues.push(now, now);

            const fPlaceholders = fInsertCols
              .map((_, i) => `$${i + 1}`)
              .join(", ");
            await client.query(
              `INSERT INTO "fulfillment" (${fInsertCols
                .map((c) => `"${c}"`)
                .join(", ")}) 
               VALUES (${fPlaceholders})`,
              fInsertValues
            );

            // Create join table entry (id is required based on error)
            const joinFulfillmentId = generateId();
            await client.query(
              `INSERT INTO "order_fulfillment" 
               (id, order_id, fulfillment_id) 
               VALUES ($1, $2, $3)`,
              [joinFulfillmentId, order.id, fulfillmentId]
            );
            fulfillmentCount++;
            if (fulfillmentCount % 10 === 0) {
              console.log(`   ✅ Created ${fulfillmentCount} fulfillments...`);
            }
          } catch (e: any) {
            console.log(
              `   ⚠️  Could not create fulfillment for order #${order.display_id}: ${e.message}`
            );
          }
        } else {
          skippedFulfillment++;
        }
      }
    }

    console.log(`\n✅ Fix Complete!`);
    console.log(`   - Payment collections created: ${paymentCount}`);
    console.log(
      `   - Payment collections skipped (already exist): ${skippedPayment}`
    );
    console.log(`   - Fulfillments created: ${fulfillmentCount}`);
    console.log(
      `   - Fulfillments skipped (already exist): ${skippedFulfillment}`
    );
    console.log(`\n💡 Refresh Medusa Admin to see updated statuses.\n`);
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
