/**
 * Inspect order table schema and foreign keys
 */

// import { ExecArgs } from "@medusajs/framework/types"
import { Client } from "pg"

export default async function inspectOrderSchema({ container }: any) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  
  const client = new Client({
    connectionString: databaseUrl,
  })
  
  await client.connect()
  
  try {
    // Get all tables
    const allTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)
    
    console.log('All tables in database:')
    allTables.rows.forEach((row: any) => {
      console.log(`  - ${row.table_name}`)
    })
    
    // Check order table columns
    const orderCols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'order'
      ORDER BY ordinal_position
    `)
    
    console.log('\nOrder table columns:')
    orderCols.rows.forEach((row: any) => {
      console.log(`  - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`)
    })
    
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
        AND tc.table_name = 'order'
    `)
    
    console.log('\nForeign keys on order table:')
    fks.rows.forEach((row: any) => {
      console.log(`  ${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`)
    })
    
  } catch (error: any) {
    console.error('Error:', error.message)
    console.error(error.stack)
  } finally {
    await client.end()
  }
}

