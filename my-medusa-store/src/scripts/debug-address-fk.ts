/**
 * Debug address foreign key issue
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Client } from "pg"

export default async function debugAddressFk({ container }: ExecArgs) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  
  const client = new Client({
    connectionString: databaseUrl,
  })
  
  await client.connect()
  
  try {
    // Get detailed foreign key info
    const fkDetail = await client.query(`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      LEFT JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'order'
        AND kcu.column_name LIKE '%address%'
    `)
    
    console.log('Foreign key details for order table addresses:')
    fkDetail.rows.forEach((row: any) => {
      console.log(`\n  Constraint: ${row.constraint_name}`)
      console.log(`  Column: ${row.column_name}`)
      console.log(`  References: ${row.foreign_table_name}.${row.foreign_column_name}`)
      console.log(`  Update rule: ${row.update_rule}`)
      console.log(`  Delete rule: ${row.delete_rule}`)
    })
    
    // Try to create a test address and see what happens
    console.log('\n\nTesting address creation...')
    const testCustomerId = 'test-customer-' + Date.now()
    const testAddressId = 'test-address-' + Date.now()
    
    try {
      // Create test customer first
      await client.query(`
        INSERT INTO "customer" (id, email, first_name, last_name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
      `, [testCustomerId, 'test@example.com', 'Test', 'User'])
      console.log('  ✅ Test customer created')
      
      // Try creating address in customer_address
      await client.query(`
        INSERT INTO "customer_address" (
          id, customer_id, first_name, last_name, address_1, city, postal_code, country_code,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      `, [testAddressId, testCustomerId, 'Test', 'User', '123 Test St', 'Test City', '12345', 'in'])
      console.log('  ✅ Test address created in customer_address')
      
      // Check if we can use it in order
      const testOrderId = 'test-order-' + Date.now()
      try {
        await client.query(`
          INSERT INTO "order" (
            id, display_id, email, currency_code, region_id, customer_id,
            billing_address_id, shipping_address_id, status, metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        `, [
          testOrderId,
          999999,
          'test@example.com',
          'inr',
          (await client.query('SELECT id FROM "region" LIMIT 1')).rows[0]?.id || 'test-region',
          testCustomerId,
          testAddressId,
          testAddressId,
          'pending',
          '{}'
        ])
        console.log('  ✅ Test order created successfully with address!')
        
        // Cleanup
        await client.query('DELETE FROM "order" WHERE id = $1', [testOrderId])
        console.log('  ✅ Test order cleaned up')
      } catch (orderError: any) {
        console.log(`  ❌ Failed to create test order: ${orderError.message}`)
        console.log(`     This tells us what's wrong!`)
      }
      
      // Cleanup
      await client.query('DELETE FROM "customer_address" WHERE id = $1', [testAddressId])
      await client.query('DELETE FROM "customer" WHERE id = $1', [testCustomerId])
      console.log('  ✅ Test data cleaned up')
      
    } catch (testError: any) {
      console.log(`  ❌ Test failed: ${testError.message}`)
    }
    
  } catch (error: any) {
    console.error('Error:', error.message)
    console.error(error.stack)
  } finally {
    await client.end()
  }
}

