/**
 * Check how order_line_item is linked to order in Medusa v2
 */

// // import { ExecArgs } from "@medusajs/framework/types";
import { Client } from "pg";

export default async function checkLineItemRelationship({
  container,
}: any) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  try {
    // Check all foreign keys on order_line_item
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

    console.log("Foreign keys on order_line_item:");
    fks.rows.forEach((row: any) => {
      console.log(
        `  ${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`
      );
    });

    // Check if there's a join table
    const joinTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND (table_name LIKE '%order%line%' OR table_name LIKE '%line%order%')
      ORDER BY table_name
    `);

    console.log("\nPossible join tables:");
    joinTables.rows.forEach((row: any) => {
      console.log(`  - ${row.table_name}`);
    });

    // Check order_totals table if it exists
    const totalsTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name LIKE '%total%'
      ORDER BY table_name
    `);

    console.log("\nTotal-related tables:");
    totalsTables.rows.forEach((row: any) => {
      console.log(`  - ${row.table_name}`);
    });

    // Check if totals_id links to something
    if (fks.rows.some((r: any) => r.column_name === "totals_id")) {
      const totalsFk = fks.rows.find((r: any) => r.column_name === "totals_id");
      console.log(
        `\n  totals_id -> ${totalsFk.foreign_table_name}.${totalsFk.foreign_column_name}`
      );

      // Check if that table links to order
      const totalsToOrder = await client.query(
        `
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1
          AND ccu.table_name = 'order'
      `,
        [totalsFk.foreign_table_name]
      );

      if (totalsToOrder.rows.length > 0) {
        console.log(
          `\n  ✅ Found link: order_line_item -> ${totalsFk.foreign_table_name} -> order`
        );
        console.log(`     Use totals_id to link line items to orders`);
      }
    }
  } catch (error: any) {
    console.error("Error:", error.message);
  } finally {
    await client.end();
  }
}

