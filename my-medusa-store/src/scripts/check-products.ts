/**
 * Diagnostic script to check products in Medusa database
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Client } from "pg"

export default async function checkProducts({ container }: ExecArgs) {
  console.log('🔍 Checking products in Medusa database...\n')
  
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  
  const client = new Client({
    connectionString: databaseUrl,
  })
  
  await client.connect()
  console.log('✅ Connected to database\n')
  
  try {
    // Get total products
    const totalResult = await client.query(`
      SELECT COUNT(DISTINCT p.id) as total
      FROM "product" p
    `)
    const total = parseInt(totalResult.rows[0].total)
    console.log(`📦 Total products: ${total}`)
    
    // Get products with variants
    const variantsResult = await client.query(`
      SELECT COUNT(*) as total
      FROM "product" p
      INNER JOIN "product_variant" pv ON p.id = pv.product_id
    `)
    const variants = parseInt(variantsResult.rows[0].total)
    console.log(`📦 Total product variants: ${variants}\n`)
    
    // Get sample products
    const sampleResult = await client.query(`
      SELECT 
        p.id,
        p.title,
        p.metadata,
        p.metadata->>'opencart_id' as opencart_id,
        COUNT(pv.id) as variant_count
      FROM "product" p
      LEFT JOIN "product_variant" pv ON p.id = pv.product_id
      GROUP BY p.id, p.title, p.metadata
      ORDER BY p.created_at
      LIMIT 10
    `)
    
    console.log(`📋 Sample products (first 10):`)
    for (const product of sampleResult.rows) {
      const ocId = product.opencart_id || 'NONE'
      const metadataStr = product.metadata ? JSON.stringify(product.metadata).substring(0, 80) : 'null'
      console.log(`   - ${product.title}`)
      console.log(`     ID: ${product.id}`)
      console.log(`     OpenCart ID: ${ocId}`)
      console.log(`     Variants: ${product.variant_count}`)
      console.log(`     Metadata: ${metadataStr}...`)
      console.log('')
    }
    
    // Count products with opencart_id
    const withOcIdResult = await client.query(`
      SELECT COUNT(DISTINCT p.id) as total
      FROM "product" p
      WHERE p.metadata->>'opencart_id' IS NOT NULL
        AND p.metadata->>'opencart_id' != 'null'
        AND p.metadata->>'opencart_id' != ''
    `)
    const withOcId = parseInt(withOcIdResult.rows[0].total)
    console.log(`\n📊 Summary:`)
    console.log(`   - Products with opencart_id: ${withOcId}`)
    console.log(`   - Products without opencart_id: ${total - withOcId}`)
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    throw error
  } finally {
    await client.end()
  }
}

