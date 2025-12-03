import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { Client } from "pg"

// Get products with filters for flash sale selection
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  let dbClient: Client | null = null
  
  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    const queryParams = req.query
    
    const { category, collection, type, search, limit = "100" } = queryParams
    const limitNum = parseInt(limit as string) || 100
    
    // Fetch all products (or use search if provided)
    let allProducts: any[] = []
    
    if (search) {
      allProducts = await productModuleService.listProducts({
        q: search as string,
      })
    } else {
      allProducts = await productModuleService.listProducts({})
    }
    
    // Filter products in memory based on category, collection, and type
    let filteredProducts = allProducts
    
    if (category) {
      filteredProducts = filteredProducts.filter((product: any) => {
        return product.categories?.some((cat: any) => cat.id === category) || false
      })
    }
    
    if (collection) {
      filteredProducts = filteredProducts.filter((product: any) => {
        return product.collection_id === collection || 
               product.collections?.some((col: any) => col.id === collection) || false
      })
    }
    
    if (type) {
      filteredProducts = filteredProducts.filter((product: any) => {
        return product.type_id === type || product.type?.id === type || false
      })
    }
    
    // Apply limit after filtering
    filteredProducts = filteredProducts.slice(0, limitNum)
    
    // Get product IDs
    const productIds = filteredProducts.map((p: any) => p.id).filter(Boolean)
    
    if (productIds.length === 0) {
      return res.json({ products: [] })
    }
    
    // Map prices directly from database
    const pricesMap = new Map<string, number>()
    
    try {
      // Connect to database
      const databaseUrl = process.env.DATABASE_URL
      if (!databaseUrl) {
        throw new Error("DATABASE_URL environment variable is not set")
      }
      
      dbClient = new Client({
        connectionString: databaseUrl,
      })
      await dbClient.connect()
      
      console.log(`[Flash Sale Products] Querying database for prices of ${productIds.length} products...`)
      
      // Based on the actual database structure:
      // product_variant -> product_variant_price_set (variant_id) -> price_set (id) -> price (price_set_id)
      const placeholders = productIds.map((_, i) => `$${i + 1}`).join(",")
      
      // Query: variant -> link table -> price_set -> price
      const priceQuery = `
        SELECT DISTINCT ON (pv.product_id)
          pv.product_id,
          p.amount,
          p.currency_code,
          p.price_set_id
        FROM product_variant pv
        INNER JOIN product_variant_price_set pvps ON pvps.variant_id = pv.id
        INNER JOIN price_set ps ON ps.id = pvps.price_set_id
        INNER JOIN price p ON p.price_set_id = ps.id
        WHERE pv.product_id IN (${placeholders})
          AND p.amount IS NOT NULL
          AND p.amount > 0
          AND p.deleted_at IS NULL
        ORDER BY pv.product_id, 
                 CASE WHEN p.currency_code = 'inr' THEN 0 ELSE 1 END,
                 p.amount ASC
      `
      
      console.log(`[Flash Sale Products] Executing price query for ${productIds.length} products...`)
      const result = await dbClient.query(priceQuery, productIds)
      
      console.log(`[Flash Sale Products] Query returned ${result.rows.length} price rows`)
      
      // Map prices: product_id -> amount (prefer INR)
      // Amount is already in rupees, not in cents/paise
      result.rows.forEach((row: any) => {
        if (row.product_id && row.amount) {
          // Convert amount to number (it might be a string from database)
          const amount = typeof row.amount === 'string' ? parseFloat(row.amount) : Number(row.amount)
          
          if (isNaN(amount) || amount <= 0) {
            return // Skip invalid amounts
          }
          
          const existingPrice = pricesMap.get(row.product_id)
          const isInr = row.currency_code?.toLowerCase() === "inr"
          
          if (!existingPrice) {
            pricesMap.set(row.product_id, amount)
          } else if (isInr) {
            // Replace with INR price (prefer INR)
            pricesMap.set(row.product_id, amount)
          }
        }
      })
      
      console.log(`[Flash Sale Products] Mapped ${pricesMap.size} prices from ${result.rows.length} rows`)
      
      // If still no prices, log table structure for debugging
      if (pricesMap.size === 0 && result.rows.length === 0) {
        console.log(`[Flash Sale Products] No prices found. Checking data structure...`)
        
        // Check if variants exist
        const variantCheck = await dbClient.query(`
          SELECT pv.id, pv.product_id
          FROM product_variant pv
          WHERE pv.product_id IN (${placeholders})
          LIMIT 5
        `, productIds.slice(0, 5))
        
        console.log(`[Flash Sale Products] Sample variants (${variantCheck.rows.length}):`, variantCheck.rows)
        
        // Check if link table has data
        if (variantCheck.rows.length > 0) {
          const variantIds = variantCheck.rows.map((r: any) => r.id)
          const linkCheck = await dbClient.query(`
            SELECT pvps.variant_id, pvps.price_set_id
            FROM product_variant_price_set pvps
            WHERE pvps.variant_id IN (${variantIds.map((_, i) => `$${i + 1}`).join(",")})
            LIMIT 5
          `, variantIds.slice(0, 5))
          
          console.log(`[Flash Sale Products] Sample links (${linkCheck.rows.length}):`, linkCheck.rows)
          
          // Check if prices exist for those price sets
          if (linkCheck.rows.length > 0) {
            const priceSetIds = linkCheck.rows.map((r: any) => r.price_set_id)
            const priceCheck = await dbClient.query(`
              SELECT p.price_set_id, p.amount, p.currency_code
              FROM price p
              WHERE p.price_set_id IN (${priceSetIds.map((_, i) => `$${i + 1}`).join(",")})
                AND p.deleted_at IS NULL
              LIMIT 10
            `, priceSetIds.slice(0, 10))
            
            console.log(`[Flash Sale Products] Sample prices (${priceCheck.rows.length}):`, priceCheck.rows)
          }
        }
      }
      
      console.log(`[Flash Sale Products] Final: Mapped ${pricesMap.size} prices for ${productIds.length} products`)
      if (pricesMap.size > 0) {
        const sampleEntries = Array.from(pricesMap.entries()).slice(0, 5)
        console.log(`[Flash Sale Products] Sample prices:`, sampleEntries.map(([productId, amount]) => ({
          product_id: productId,
          amount: amount,
          amount_display: `₹${amount}` // Amount is already in rupees, no conversion needed
        })))
      } else {
        console.warn(`[Flash Sale Products] WARNING: No prices mapped! All products will show ₹0`)
      }
    } catch (dbError: any) {
      console.error("[Flash Sale Products] Database query error:", dbError.message)
      console.error("[Flash Sale Products] Error stack:", dbError.stack)
      
      // Try alternative query structure if the first one fails
      if (dbClient) {
        try {
          console.log(`[Flash Sale Products] Trying alternative query structure...`)
          
          // Alternative: Check what tables actually exist
          const tableCheck = await dbClient.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND (table_name LIKE '%price%' OR table_name LIKE '%variant%' OR table_name LIKE '%money%')
            ORDER BY table_name
          `)
          
          console.log(`[Flash Sale Products] Available tables:`, tableCheck.rows.map((r: any) => r.table_name))
        } catch (checkError: any) {
          console.error("[Flash Sale Products] Table check failed:", checkError.message)
        }
      }
    } finally {
      if (dbClient) {
        await dbClient.end()
        dbClient = null
      }
    }
    
    // Format products for response
    const formattedProducts = filteredProducts.map((product: any) => {
      // Get price from map
      let price = 0
      if (pricesMap.has(product.id)) {
        const priceAmount = pricesMap.get(product.id) || 0
        // Amount from database is already in rupees (not in cents/paise)
        // Convert to number if it's a string
        price = typeof priceAmount === 'string' ? parseFloat(priceAmount) : priceAmount
      }
      
      // Get first variant ID (products typically have at least one variant)
      const variantId = product.variants && product.variants.length > 0 
        ? product.variants[0].id 
        : null
      
      return {
        id: product.id,
        title: product.title,
        thumbnail: product.thumbnail,
        images: product.images,
        price: price,
        variant_id: variantId,
      }
    })
    
    return res.json({ products: formattedProducts })
  } catch (error: any) {
    console.error("Error fetching products:", error)
    return res.status(500).json({ 
      message: "Failed to fetch products",
      error: error.message 
    })
  } finally {
    // Connection already closed in inner finally block
    // No need to close again
  }
}