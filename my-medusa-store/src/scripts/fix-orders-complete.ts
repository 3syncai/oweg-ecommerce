// // import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

/**
 * Complete fix for orders:
 * 1. Creates payment_collection entries if needed
 * 2. Creates fulfillment entries if needed
 * 3. Updates metadata format
 */
export default async function fixOrdersComplete({ container }: any) {
  console.log(
    "🔧 Fixing orders - creating payment_collection and fulfillment entries..."
  );

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

    const hasPaymentCollection = tablesCheck.rows.some(
      (r) => r.table_name === "payment_collection"
    );
    const hasFulfillment = tablesCheck.rows.some(
      (r) => r.table_name === "fulfillment"
    );

    console.log(`📋 Tables found:`);
    console.log(`   payment_collection: ${hasPaymentCollection ? "✅" : "❌"}`);
    console.log(`   fulfillment: ${hasFulfillment ? "✅" : "❌"}\n`);

    // Get all orders
    const ordersResult = await client.query(`
      SELECT 
        id, display_id, status, metadata,
        (metadata->>'payment_status')::text as payment_status,
        (metadata->>'fulfillment_status')::text as fulfillment_status,
        currency_code, region_id
      FROM "order"
      ORDER BY created_at DESC
    `);

    console.log(`📦 Processing ${ordersResult.rows.length} orders...\n`);

    // Fetch a fallback user (admin) for created_by if needed
    let fallbackUserId: string | null = null;
    try {
      // Try to find a user, any user
      const userRes = await client.query('SELECT id FROM "user" LIMIT 1');
      if (userRes.rows.length > 0) {
        fallbackUserId = userRes.rows[0].id;
        console.log(`ℹ️  Will use user ID ${fallbackUserId} for created_by field`);
      } else {
         console.log(`⚠️  No users found in DB. created_by might fail if non-nullable.`);
      }
    } catch (e) {
       console.log(`⚠️  Could not fetch users (table might be missing or different schema). Ignoring.`);
    }

    let fixedCount = 0;

    for (const order of ordersResult.rows) {
      let orderFixed = false;

      // Create payment_collection if it doesn't exist
      if (hasPaymentCollection) {
        const paymentCheck = await client.query(
          `
          SELECT id FROM "payment_collection" WHERE order_id = $1 LIMIT 1
        `,
          [order.id]
        );

        if (paymentCheck.rows.length === 0) {
          // Get payment status from metadata or default
          const paymentStatus = order.payment_status || "awaiting";

          // Check payment_collection table structure
          const paymentCols = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'payment_collection'
            ORDER BY ordinal_position
          `);

          const paymentId = generateId();
          const now = new Date();

          // Build insert based on available columns
          const paymentColNames: string[] = [];
          const paymentValues: any[] = [];
          let paramIndex = 1;

          // Required columns
          if (paymentCols.rows.some((r: any) => r.column_name === "id")) {
            paymentColNames.push("id");
            paymentValues.push(paymentId);
            paramIndex++;
          }

          if (paymentCols.rows.some((r: any) => r.column_name === "order_id")) {
            paymentColNames.push("order_id");
            paymentValues.push(order.id);
            paramIndex++;
          }

          if (paymentCols.rows.some((r: any) => r.column_name === "status")) {
            paymentColNames.push("status");
            paymentValues.push(
              paymentStatus === "captured" ? "authorized" : "not_paid"
            );
            paramIndex++;
          }

          if (
            paymentCols.rows.some((r: any) => r.column_name === "created_at")
          ) {
            paymentColNames.push("created_at");
            paymentValues.push(now);
            paramIndex++;
          }

          if (
            paymentCols.rows.some((r: any) => r.column_name === "updated_at")
          ) {
            paymentColNames.push("updated_at");
            paymentValues.push(now);
            paramIndex++;
          }

          // Add Missing Columns: amount, currency_code, region_id, type
          if (paymentCols.rows.some((r: any) => r.column_name === "amount")) {
             paymentColNames.push("amount");
             // Default to 0 or try to parse from metadata totals if available, strictly 0 is safer than crashing
             paymentValues.push(0); 
             paramIndex++;
          }
           if (paymentCols.rows.some((r: any) => r.column_name === "currency_code")) {
             paymentColNames.push("currency_code");
             paymentValues.push(order.currency_code || "inr");
             paramIndex++;
          }
           if (paymentCols.rows.some((r: any) => r.column_name === "region_id")) {
             paymentColNames.push("region_id");
             paymentValues.push(order.region_id);
             paramIndex++;
          }
           if (paymentCols.rows.some((r: any) => r.column_name === "type")) {
             paymentColNames.push("type");
             paymentValues.push("order_edit"); // Default type
             paramIndex++;
          }
           if (paymentCols.rows.some((r: any) => r.column_name === "created_by")) {
             paymentColNames.push("created_by");
             // Use fallback or null. If non-nullable and no user exists, it will fail, which is correct behavior (DB constraint).
             paymentValues.push(fallbackUserId); 
             paramIndex++;
          }

          if (paymentColNames.length > 0) {
            const placeholders = paymentColNames
              .map((_, i) => `$${i + 1}`)
              .join(", ");
            await client.query(
              `INSERT INTO "payment_collection" (${paymentColNames
                .map((c) => `"${c}"`)
                .join(", ")}) VALUES (${placeholders})`,
              paymentValues
            );
            console.log(
              `   ✅ Created payment_collection for order #${order.display_id}`
            );
            orderFixed = true;
          }
        }
      }

      // Create fulfillment if it doesn't exist
      if (hasFulfillment) {
        const fulfillmentCheck = await client.query(
          `
          SELECT id FROM "fulfillment" WHERE order_id = $1 LIMIT 1
        `,
          [order.id]
        );

        if (fulfillmentCheck.rows.length === 0) {
          // Get fulfillment status from metadata or default
          const fulfillmentStatus = order.fulfillment_status || "not_fulfilled";

          // Check fulfillment table structure
          const fulfillmentCols = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'fulfillment'
            ORDER BY ordinal_position
          `);

          const fulfillmentId = generateId();
          const now = new Date();

          // Build insert based on available columns
          const fulfillmentColNames: string[] = [];
          const fulfillmentValues: any[] = [];

          // Required columns
          if (fulfillmentCols.rows.some((r: any) => r.column_name === "id")) {
            fulfillmentColNames.push("id");
            fulfillmentValues.push(fulfillmentId);
          }

          if (fulfillmentCols.rows.some((r) => r.column_name === "order_id")) {
            fulfillmentColNames.push("order_id");
            fulfillmentValues.push(order.id);
          }

          if (fulfillmentCols.rows.some((r) => r.column_name === "status")) {
            fulfillmentColNames.push("status");
            fulfillmentValues.push(
              fulfillmentStatus === "fulfilled" ? "fulfilled" : "not_fulfilled"
            );
          }

          if (
            fulfillmentCols.rows.some((r) => r.column_name === "created_at")
          ) {
            fulfillmentColNames.push("created_at");
            fulfillmentValues.push(now);
          }

          if (
            fulfillmentCols.rows.some((r) => r.column_name === "updated_at")
          ) {
            fulfillmentColNames.push("updated_at");
            fulfillmentValues.push(now);
          }

          if (fulfillmentColNames.length > 0) {
            const placeholders = fulfillmentColNames
              .map((_, i) => `$${i + 1}`)
              .join(", ");
            await client.query(
              `INSERT INTO "fulfillment" (${fulfillmentColNames
                .map((c) => `"${c}"`)
                .join(", ")}) VALUES (${placeholders})`,
              fulfillmentValues
            );
            console.log(
              `   ✅ Created fulfillment for order #${order.display_id}`
            );
            orderFixed = true;
          }
        }
      }

      if (orderFixed) {
        fixedCount++;
      }
    }

    console.log(`\n✅ Fixed ${fixedCount} orders`);
  } catch (error) {
    console.error("❌ Error:", error);
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
