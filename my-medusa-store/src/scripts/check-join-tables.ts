// // import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

export default async function checkJoinTables({ container }: any) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("✅ Connected to database\n");

    // Check order_payment_collection structure
    const opcCols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'order_payment_collection'
      ORDER BY ordinal_position
    `);

    console.log("📋 order_payment_collection columns:");
    opcCols.rows.forEach((r) => {
      console.log(
        `   ${r.column_name}: ${r.data_type} (${
          r.is_nullable === "YES" ? "nullable" : "NOT NULL"
        })`
      );
    });

    // Check order_fulfillment structure
    const ofCols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'order_fulfillment'
      ORDER BY ordinal_position
    `);

    console.log("\n📋 order_fulfillment columns:");
    ofCols.rows.forEach((r) => {
      console.log(
        `   ${r.column_name}: ${r.data_type} (${
          r.is_nullable === "YES" ? "nullable" : "NOT NULL"
        })`
      );
    });
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  } finally {
    await client.end();
  }
}

