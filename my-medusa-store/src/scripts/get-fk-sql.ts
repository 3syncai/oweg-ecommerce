/**
 * Get the actual SQL definition of foreign key
 */

// import { ExecArgs } from "@medusajs/framework/types"
import { Client } from "pg"

export default async function getFkSql({ container }: any) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  
  const client = new Client({
    connectionString: databaseUrl,
  })
  
  await client.connect()
  
  try {
    // Get the actual constraint definition
    const constraintSql = await client.query(`
      SELECT pg_get_constraintdef(oid) as constraint_def
      FROM pg_constraint
      WHERE conname = 'order_shipping_address_id_foreign'
    `)
    
    if (constraintSql.rows.length > 0) {
      console.log('Foreign key constraint definition:')
      console.log(constraintSql.rows[0].constraint_def)
    } else {
      console.log('Constraint not found with that exact name')
      
      // Try to find similar constraints
      const allConstraints = await client.query(`
        SELECT conname, pg_get_constraintdef(oid) as constraint_def
        FROM pg_constraint
        WHERE conrelid = 'order'::regclass
        AND contype = 'f'
        AND conname LIKE '%address%'
      `)
      
      console.log('\nAll address-related foreign keys on order table:')
      allConstraints.rows.forEach((row: any) => {
        console.log(`\n${row.conname}:`)
        console.log(row.constraint_def)
      })
    }
    
  } catch (error: any) {
    console.error('Error:', error.message)
  } finally {
    await client.end()
  }
}

