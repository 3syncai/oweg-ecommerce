/**
 * Check order table schema
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Client } from "pg"

export default async function checkOrderSchema({ container }: any) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  
  const client = new Client({
    connectionString: databaseUrl,
  })
  
  await client.connect()
  
  try {
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'order'
      ORDER BY ordinal_position
    `)
    
    console.log('Order table columns:')
    result.rows.forEach((row: any) => {
      console.log(`  - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`)
    })
  } catch (error: any) {
    console.error('Error:', error.message)
  } finally {
    await client.end()
  }
}

