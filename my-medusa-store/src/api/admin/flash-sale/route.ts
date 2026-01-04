import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { Client } from "pg"
import FlashSaleModuleService from "../../../modules/flash-sale/service"
import { FLASH_SALE_MODULE } from "../../../modules/flash-sale"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const flashSaleService: FlashSaleModuleService = req.scope.resolve(FLASH_SALE_MODULE)
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    
    // Get all flash sale items (including expired ones for display)
    const allItems = await flashSaleService.listFlashSaleItems({})
    
    // Filter out deleted items
    const activeItems = allItems.filter((item: any) => !item.deleted_at)
    
    // Get unique product IDs
    const productIds = Array.from(new Set(activeItems.map((item: any) => item.product_id)))
    
    // Fetch products for display
    const productsMap = new Map()
    if (productIds.length > 0) {
      try {
        const products = await productModuleService.listProducts({
          id: productIds,
        })
        
        products.forEach((product: any) => {
          productsMap.set(product.id, {
            id: product.id,
            title: product.title,
            thumbnail: product.thumbnail,
          })
        })
      } catch (productErr: any) {
        console.error("Error fetching products for flash sales:", productErr)
      }
    }
    
    // Group items by expiration time and enrich with product data
    const now = new Date()
    const enrichedItems = activeItems.map((item: any) => {
      const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at)
      const isActive = expiresAt > now
      const product = productsMap.get(item.product_id) || { id: item.product_id, title: "Unknown Product" }
      
      return {
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_title: product.title,
        product_thumbnail: product.thumbnail,
        flash_sale_price: item.flash_sale_price,
        original_price: item.original_price,
        expires_at: item.expires_at,
        created_at: item.created_at,
        updated_at: item.updated_at,
        is_active: isActive,
        time_remaining_ms: isActive ? Math.max(0, expiresAt.getTime() - now.getTime()) : 0,
      }
    })
    
    // Sort: active first (by expiration time ascending), then expired (by expiration time descending)
    enrichedItems.sort((a, b) => {
      const aExpires = new Date(a.expires_at).getTime()
      const bExpires = new Date(b.expires_at).getTime()
      
      if (a.is_active && b.is_active) {
        return aExpires - bExpires // Active: earliest expiration first
      }
      if (a.is_active) return -1 // Active before expired
      if (b.is_active) return 1
      return bExpires - aExpires // Expired: most recent first
    })
    
    return res.json({ 
      flash_sale_items: enrichedItems,
      active_count: enrichedItems.filter((item: any) => item.is_active).length,
      total_count: enrichedItems.length,
    })
  } catch (error: any) {
    console.error("Error fetching flash sale items:", error)
    return res.status(500).json({ 
      message: "Failed to fetch flash sale items",
      error: error.message 
    })
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const flashSaleService: FlashSaleModuleService = req.scope.resolve(FLASH_SALE_MODULE)
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    const query = req.scope.resolve("query")
    
    const { items } = req.body as any
    
    // Validate input
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        message: "items must be a non-empty array" 
      })
    }
    
    // Validate each item and fetch variant info
    const validatedItems: any[] = []
    for (const item of items) {
      if (!item.product_id) {
        return res.status(400).json({ 
          message: "Each item must have a product_id" 
        })
      }
      if (!item.flash_sale_price || typeof item.flash_sale_price !== 'number') {
        return res.status(400).json({ 
          message: "Each item must have a flash_sale_price (number)" 
        })
      }
      if (!item.expires_at) {
        return res.status(400).json({ 
          message: "Each item must have an expires_at (timer)" 
        })
      }
      
      // Get variant_id - use provided one or fetch from database
      let variantId = item.variant_id
      
      // If variant_id not provided or is null, fetch from database directly
      if (!variantId) {
        try {
          // Use direct database query to fetch first variant (most reliable)
          const databaseUrl = process.env.DATABASE_URL
          if (!databaseUrl) {
            return res.status(500).json({ 
              message: "DATABASE_URL environment variable is not set" 
            })
          }
          
          const dbClient = new Client({
            connectionString: databaseUrl,
          })
          
          try {
            await dbClient.connect()
            
            const result = await dbClient.query(
              `SELECT id FROM product_variant WHERE product_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
              [item.product_id]
            )
            
            if (result.rows.length === 0) {
              await dbClient.end()
              return res.status(400).json({ 
                message: `Product ${item.product_id} has no variants. Please ensure the product has at least one variant in the product details page.` 
              })
            }
            
            variantId = result.rows[0].id
            console.log(`[Flash Sale] Found variant ${variantId} for product ${item.product_id}`)
            
            await dbClient.end()
          } catch (dbErr: any) {
            await dbClient.end()
            throw dbErr
          }
        } catch (variantErr: any) {
          console.error(`Error fetching variants for product ${item.product_id}:`, variantErr)
          return res.status(400).json({ 
            message: `Failed to fetch variants for product ${item.product_id}: ${variantErr.message}. Please ensure the product has at least one variant.` 
          })
        }
      }
      
      // Validate variant_id is present
      if (!variantId) {
        return res.status(400).json({ 
          message: `Could not determine variant_id for product ${item.product_id}. Please ensure the product has at least one variant.` 
        })
      }
      
      validatedItems.push({
        product_id: item.product_id,
        variant_id: variantId,
        flash_sale_price: item.flash_sale_price,
        original_price: item.original_price || 0, // Use provided original_price
        expires_at: item.expires_at,
      })
    }
    
    // Create flash sale items
    const createdItems = await flashSaleService.createFlashSaleItemsBatch(validatedItems)
    
    return res.json({ flash_sale_items: createdItems })
  } catch (error: any) {
    console.error("Error creating flash sale items:", error)
    return res.status(500).json({ 
      message: "Failed to create flash sale items",
      error: error.message 
    })
  }
}