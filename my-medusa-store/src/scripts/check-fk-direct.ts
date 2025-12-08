/**
 * Directly check foreign key using SQL
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Client } from "pg"

export default async function checkFkDirect({ container }: any) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  
  const client = new Client({
    connectionString: databaseUrl,
  })
  
  await client.connect()
  
  try {
    // Get foreign key definition
    const fkResult = await client.query(`
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
        AND (kcu.column_name LIKE '%address%')
    `)
    
    console.log('Foreign key constraints:')
    fkResult.rows.forEach((row: any) => {
      console.log(`  ${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`)
    })
    
    // Try creating a test scenario
    console.log('\nTesting address creation and order insertion...')
    
    // Create test customer
    const testCustomerId = 'test-' + Date.now()
    await client.query(`
      INSERT INTO "customer" (id, email, first_name, last_name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [testCustomerId, 'test@test.com', 'Test', 'User'])
    console.log('✅ Test customer created')
    
    // Create test address
    const testAddressId = 'test-addr-' + Date.now()
    await client.query(`
      INSERT INTO "customer_address" (
        id, customer_id, first_name, last_name, address_1, city, postal_code, country_code,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    `, [testAddressId, testCustomerId, 'Test', 'User', '123 St', 'City', '12345', 'in'])
    console.log('✅ Test address created')
    
    // Verify address exists
    const addrCheck = await client.query('SELECT id FROM "customer_address" WHERE id = $1', [testAddressId])
    console.log(`✅ Address verification: ${addrCheck.rows.length} row(s) found`)
    
    // Get a region
    const regionResult = await client.query('SELECT id FROM "region" LIMIT 1')
    const regionId = regionResult.rows[0]?.id
    if (!regionId) {
      throw new Error('No region found')
    }
    console.log(`✅ Using region: ${regionId}`)
    
    // Try to create order
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
        'test@test.com',
        'inr',
        regionId,
        testCustomerId,
        testAddressId,
        testAddressId,
        'pending',
        '{}'
      ])
      console.log('✅ Test order created successfully!')
      
      // Cleanup
      await client.query('DELETE FROM "order" WHERE id = $1', [testOrderId])
      await client.query('DELETE FROM "customer_address" WHERE id = $1', [testAddressId])
      await client.query('DELETE FROM "customer" WHERE id = $1', [testCustomerId])
      console.log('✅ Test data cleaned up')
    } catch (orderError: any) {
      console.log(`❌ Order creation failed: ${orderError.message}`)
      console.log(`   This is the actual error we need to fix!`)
      
      // Cleanup
      await client.query('DELETE FROM "customer_address" WHERE id = $1', [testAddressId]).catch(() => {})
      await client.query('DELETE FROM "customer" WHERE id = $1', [testCustomerId]).catch(() => {})
    }
    
  } catch (error: any) {
    console.error('Error:', error.message)
    console.error(error.stack)
  } finally {
    await client.end()
  }
}

