/**
 * Check order table foreign key constraints for addresses
 */

// import { ExecArgs } from "@medusajs/framework/types"
import { Client } from "pg"

export default async function checkOrderAddressFk({ container }: any) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  
  const client = new Client({
    connectionString: databaseUrl,
  })
  
  await client.connect()
  
  try {
    // Check foreign key constraints on order table
    const fkResult = await client.query(`
      SELECT
        tc.constraint_name,
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
        AND (kcu.column_name LIKE '%address%' OR kcu.column_name LIKE '%billing%' OR kcu.column_name LIKE '%shipping%')
    `)
    
    console.log('Foreign key constraints on order table for addresses:')
    fkResult.rows.forEach((row: any) => {
      console.log(`  ${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`)
    })
    
    // Check if address table exists
    const addressTableResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN ('address', 'customer_address', 'order_address')
    `)
    
    console.log('\nAddress-related tables:')
    addressTableResult.rows.forEach((row: any) => {
      console.log(`  - ${row.table_name}`)
    })
    
    // Check order table columns
    const orderColumnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'order'
        AND (column_name LIKE '%address%' OR column_name LIKE '%billing%' OR column_name LIKE '%shipping%')
    `)
    
    console.log('\nOrder table address-related columns:')
    orderColumnsResult.rows.forEach((row: any) => {
      console.log(`  - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`)
    })
    
  } catch (error: any) {
    console.error('Error:', error.message)
  } finally {
    await client.end()
  }
}

