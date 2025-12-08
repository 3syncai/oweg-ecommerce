/**
 * Add opencart_id to existing products in Medusa
 * 
 * This script matches existing Medusa products with OpenCart products
 * by SKU/model and adds opencart_id to product metadata
 * 
 * Usage:
 *   cd my-medusa-store
 *   npx medusa exec ./src/scripts/add-opencart-id-to-products.ts
 */

// import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { Client } from "pg"

export default async function addOpencartIdToProducts({ container }: any) {
  console.log('🚀 Adding opencart_id to existing products...\n')
  
  if (!container) {
    throw new Error('Container not provided')
  }
  
  // Get database connection
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
    // Connect to OpenCart to get product mappings
    const mysql = require('mysql2/promise')
    const ocConnection = await mysql.createConnection({
      host: process.env.OPENCART_DB_HOST || '147.93.31.253',
      port: parseInt(process.env.OPENCART_DB_PORT || '3306', 10),
      user: process.env.OPENCART_DB_USER || 'oweg_user2',
      password: process.env.OPENCART_DB_PASSWORD || 'Oweg#@123',
      database: process.env.OPENCART_DB_NAME || 'oweg_db',
    })
    
    console.log('✅ Connected to OpenCart database\n')
    
    // Get all OpenCart products with product_id, sku, model
    const [ocProducts] = await ocConnection.query(`
      SELECT product_id, sku, model, upc, ean
      FROM oc_product
      ORDER BY product_id
    `)
    
    console.log(`📦 Found ${ocProducts.length} products in OpenCart\n`)
    
    // First, check total products
    const totalProductsResult = await client.query(`
      SELECT COUNT(DISTINCT p.id) as total
      FROM "product" p
      INNER JOIN "product_variant" pv ON p.id = pv.product_id
    `)
    const totalProducts = parseInt(totalProductsResult.rows[0].total)
    console.log(`📦 Total products in Medusa: ${totalProducts}`)
    
    // Get all Medusa products (check if they have opencart_id)
    const allMedusaProducts = await client.query(`
      SELECT 
        p.id,
        p.title,
        p.metadata,
        pv.id as variant_id,
        pv.sku,
        pv.ean,
        pv.upc,
        p.metadata->>'opencart_id' as opencart_id
      FROM "product" p
      INNER JOIN "product_variant" pv ON p.id = pv.product_id
      ORDER BY p.created_at
    `)
    
    console.log(`📦 Found ${allMedusaProducts.rows.length} total product variants`)
    
    // Filter products that need opencart_id
    const medusaProducts = allMedusaProducts.rows.filter((p: any) => {
      const ocId = p.opencart_id
      return !ocId || ocId === 'null' || ocId === ''
    })
    
    console.log(`📦 Found ${medusaProducts.length} Medusa products without opencart_id\n`)
    
    // Show sample of products with and without opencart_id
    if (allMedusaProducts.rows.length > 0) {
      const withOcId = allMedusaProducts.rows.filter((p: any) => {
        const ocId = p.opencart_id
        return ocId && ocId !== 'null' && ocId !== ''
      })
      console.log(`   - Products WITH opencart_id: ${withOcId.length}`)
      console.log(`   - Products WITHOUT opencart_id: ${medusaProducts.length}`)
      
      if (medusaProducts.length > 0) {
        console.log(`\n   Sample products without opencart_id (first 3):`)
        medusaProducts.slice(0, 3).forEach((p: any) => {
          console.log(`      - ${p.title} (SKU: ${p.sku || 'N/A'})`)
        })
      }
      console.log('')
    }
    
    let matched = 0
    let updated = 0
    const unmatched: Array<{ medusa_id: string; title: string; sku: string }> = []
    
    // Match by SKU first, then model, then UPC/EAN
    for (const medusaProduct of medusaProducts) {
      let matchedOcProduct = null
      let matchMethod = ''
      
      // Try to match by SKU
      if (medusaProduct.sku) {
        matchedOcProduct = ocProducts.find((oc: any) => 
          oc.sku && oc.sku.toLowerCase().trim() === medusaProduct.sku.toLowerCase().trim()
        )
        if (matchedOcProduct) matchMethod = 'SKU'
      }
      
      // If not matched, try by model (from metadata or variant)
      if (!matchedOcProduct && medusaProduct.metadata?.opencart_model) {
        matchedOcProduct = ocProducts.find((oc: any) => 
          oc.model && oc.model.toLowerCase().trim() === medusaProduct.metadata.opencart_model.toLowerCase().trim()
        )
        if (matchedOcProduct) matchMethod = 'Model'
      }
      
      // If not matched, try by UPC
      if (!matchedOcProduct && medusaProduct.upc) {
        matchedOcProduct = ocProducts.find((oc: any) => 
          oc.upc && oc.upc.toString().trim() === medusaProduct.upc.toString().trim()
        )
        if (matchedOcProduct) matchMethod = 'UPC'
      }
      
      // If not matched, try by EAN
      if (!matchedOcProduct && medusaProduct.ean) {
        matchedOcProduct = ocProducts.find((oc: any) => 
          oc.ean && oc.ean.toString().trim() === medusaProduct.ean.toString().trim()
        )
        if (matchedOcProduct) matchMethod = 'EAN'
      }
      
      if (matchedOcProduct) {
        matched++
        
        // Update product metadata with opencart_id
        const currentMetadata = medusaProduct.metadata || {}
        const updatedMetadata = {
          ...currentMetadata,
          // @ts-ignore
          opencart_id: matchedOcProduct.product_id.toString(),
        }
        
        await client.query(
          `UPDATE "product" SET metadata = $1 WHERE id = $2`,
          [JSON.stringify(updatedMetadata), medusaProduct.id]
        )
        
        updated++
        // @ts-ignore
        console.log(`   ✅ Matched (${matchMethod}): ${medusaProduct.title} → OpenCart ID ${matchedOcProduct.product_id}`)
      } else {
        unmatched.push({
          medusa_id: medusaProduct.id,
          title: medusaProduct.title,
          sku: medusaProduct.sku || 'N/A',
        })
      }
    }
    
    await ocConnection.end()
    
    console.log(`\n✅ Update Complete!`)
    console.log(`   - Matched: ${matched}`)
    console.log(`   - Updated: ${updated}`)
    console.log(`   - Unmatched: ${unmatched.length}`)
    
    if (unmatched.length > 0) {
      console.log(`\n⚠️  Unmatched products (first 10):`)
      unmatched.slice(0, 10).forEach((p) => {
        console.log(`   - ${p.title} (SKU: ${p.sku})`)
      })
      if (unmatched.length > 10) {
        console.log(`   ... and ${unmatched.length - 10} more`)
      }
      console.log(`\n   These products couldn't be matched automatically.`)
      console.log(`   You may need to add opencart_id manually in Medusa admin.`)
    }
    
    if (updated > 0) {
      console.log(`\n🎉 Successfully added opencart_id to ${updated} products!`)
      console.log(`   You can now run the order migration script.`)
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    throw error
  } finally {
    await client.end()
  }
}

