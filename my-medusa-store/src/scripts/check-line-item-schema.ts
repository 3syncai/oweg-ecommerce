/**
 * Check order_line_item table schema
 */

import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

export default async function checkLineItemSchema({ container }: ExecArgs) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  try {
    // Get columns of order_line_item table (case-sensitive)
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'order_line_item'
        OR table_name = 'OrderLineItem'
        OR table_name = 'orderLineItem'
      ORDER BY ordinal_position
    `);

    if (columns.rows.length === 0) {
      // Try with quotes for case sensitivity
      const columnsQuoted = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'order_line_item'
        ORDER BY ordinal_position
      `);
      console.log("order_line_item table columns:");
      columnsQuoted.rows.forEach((row: any) => {
        console.log(
          `  - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`
        );
      });
    } else {
      console.log("order_line_item table columns:");
      columns.rows.forEach((row: any) => {
        console.log(
          `  - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`
        );
      });
    }

    // Check foreign keys
    const fks = await client.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'order_line_item'
    `);

    console.log("\nForeign keys on order_line_item table:");
    fks.rows.forEach((row: any) => {
      console.log(
        `  ${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`
      );
    });
  } catch (error: any) {
    console.error("Error:", error.message);
  } finally {
    await client.end();
  }
}
