import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { checkRateLimit } from "../../../lib/simple-rate-limit"
import { assessFlashSales } from "../../../lib/flash-sale-eligibility"
import FlashSaleModuleService from "../../../modules/flash-sale/service"
import { FLASH_SALE_MODULE } from "../../../modules/flash-sale"
import { normalizeFlashSaleTitle } from "../../../lib/flash-sale-title"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const flashSaleService: FlashSaleModuleService = req.scope.resolve(FLASH_SALE_MODULE)
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    
    // Get all flash sale items (including expired ones for display)
    const allItems = await flashSaleService.getAllFlashSaleItems()
    
    // Filter out deleted items
    const activeItems = allItems.filter((item: any) => !item.deleted_at)
    
    // Get unique product IDs
    const productIds = Array.from(new Set(activeItems.map((item: any) => item.product_id)))
    
    // Fetch products for display — include ALL statuses (draft + published)
    // here so the admin can see flash sale items that are currently hidden
    // from the storefront because their product is in draft.
    const productsMap = new Map()
    if (productIds.length > 0) {
      try {
        const products = await productModuleService.listProducts({
          id: productIds,
        }, { take: productIds.length })

        products.forEach((product: any) => {
          productsMap.set(product.id, {
            id: product.id,
            title: product.title,
            thumbnail: product.thumbnail,
            status: product.status, // 'draft' | 'proposed' | 'published' | 'rejected'
          })
        })
      } catch (productErr: any) {
        console.error("Error fetching products for flash sales:", productErr)
      }
    }

    // Group items by expiration time and enrich with product data
    const now = new Date()
    const assessed = await assessFlashSales(activeItems, activeItems.filter(item => +new Date(item.expires_at) > Date.now()))
    const enrichedItems = assessed.map((item: any) => {
      const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at)
      const isActive = expiresAt > now
      const product = productsMap.get(item.product_id) || {
        id: item.product_id,
        title: "Unknown Product",
        status: "deleted",
      }
      // "Live" = timer still running AND product is currently published in
      // the catalogue. This is the exact same condition the storefront uses,
      // so the admin can see at-a-glance what the customer sees.
      const isPublished = product.status === "published"
      const isLive = isActive && isPublished && !item.reason

      return {
        id: item.id,
        title: item.title ?? null,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_title: product.title,
        product_thumbnail: product.thumbnail,
        product_status: product.status,
        flash_sale_price: item.flash_sale_price,
        original_price: item.original_price,
        expires_at: item.expires_at,
        created_at: item.created_at,
        updated_at: item.updated_at,
        is_active: isActive,
        is_live: isLive,
        seller: item.seller,
        hidden_reason: item.reason,
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
      live_count: enrichedItems.filter((item: any) => item.is_live).length,
      hidden_count: enrichedItems.filter((item: any) => item.is_active && !item.is_live).length,
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
    const actor = (req as MedusaRequest & { auth_context?: {actor_id?: string} }).auth_context?.actor_id
    if (actor) {
      const limit = checkRateLimit({key:"flash-sale-publish:"+actor,limit:30,windowMs:60000})
      if (!limit.allowed) return res.set("Retry-After",String(limit.retryAfterSec)).status(429).json({message:"Too many publish attempts. Try again shortly."})
    }
    const { items, title: requestedTitle } = req.body as any
    let title: string | null
    try { title = normalizeFlashSaleTitle(requestedTitle) }
    catch (error) { return res.status(400).json({ message: (error as Error).message }) }
    
    // Validate input
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        message: "items must be a non-empty array" 
      })
    }
    
    if (items.some(item => !item?.product_id || !item.variant_id || !Number.isFinite(item.flash_sale_price)
      || !(Date.parse(item.expires_at) > Date.now()))) {
      return res.status(400).json({ message: "Choose a seller variant, a valid price and a future end time." })
    }
    const proposed = items.map(item => ({
      product_id: item.product_id, variant_id: item.variant_id, flash_sale_price: item.flash_sale_price,
      expires_at: item.expires_at,
    }))
    const campaigns = (await flashSaleService.getAllFlashSaleItems()).filter(item => +new Date(item.expires_at) > Date.now())
    const assessed = await assessFlashSales(proposed, [...campaigns, ...proposed])
    const issues = assessed.filter(item => item.reason).map(item => ({
      variant_id: item.variant_id, seller: item.seller, price: item.flash_sale_price, reason: item.reason,
    }))
    if (issues.length) return res.status(400).json({ message: issues[0].reason, issues })
    const validatedItems = assessed.map(({ product_id, variant_id, flash_sale_price, expires_at, regular }) =>
      ({ product_id, variant_id, flash_sale_price, expires_at, title, original_price: regular }))

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
