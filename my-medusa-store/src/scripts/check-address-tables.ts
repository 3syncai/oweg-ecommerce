/**
 * Check what address tables exist in database
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Client } from "pg"

export default async function checkAddressTables({ container }: ExecArgs) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  
  const client = new Client({
    connectionString: databaseUrl,
  })
  
  await client.connect()
  
  try {
    // Check all tables with "address" in name
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE '%address%'
      ORDER BY table_name
    `)
    
    console.log('Address-related tables found:')
    tablesResult.rows.forEach((row: any) => {
      console.log(`  - ${row.table_name}`)
    })
    
    // Check foreign key constraints on order table
    const fkResult = await client.query(`
      SELECT
        tc.constraint_name,
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
        AND (kcu.column_name LIKE '%address%')
    `)
    
    console.log('\nForeign key constraints on order table for addresses:')
    fkResult.rows.forEach((row: any) => {
      console.log(`  ${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`)
    })
    
    // Check columns of customer_address if it exists
    if (tablesResult.rows.some((r: any) => r.table_name === 'customer_address')) {
      const customerAddressCols = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'customer_address'
        ORDER BY ordinal_position
      `)
      
      console.log('\ncustomer_address table columns:')
      customerAddressCols.rows.forEach((row: any) => {
        console.log(`  - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`)
      })
    }
    
  } catch (error: any) {
    console.error('Error:', error.message)
  } finally {
    await client.end()
  }
}

