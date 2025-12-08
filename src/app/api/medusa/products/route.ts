import { NextRequest, NextResponse } from "next/server"
import {
  findCategoryByTitleOrHandle,
  findCollectionByTitleOrHandle,
  fetchProductsByCategoryId,
  fetchProductsByCollectionId,
  fetchProductsByTag,
  fetchProductsByType,
  toUiProduct,
} from "@/lib/medusa"
import { getPriceListPrices } from "@/lib/price-lists"
// MySQL import removed - using Medusa prices only

export const dynamic = "force-dynamic"

const LIST_CACHE_TTL_MS = 1000 * 60 // 1 minute cache for list responses
const MAX_CACHE_ENTRIES = 200
type CachedList = { expires: number; payload: unknown }
const listCache = new Map<string, CachedList>()

function buildCacheKey(searchParams: URLSearchParams) {
  const normalized = new URLSearchParams()
  ;["category", "categoryId", "collection", "collectionId", "tag", "type", "limit", "priceMin", "priceMax", "dealsOnly"].forEach((key) => {
    const value = searchParams.get(key)
    if (value !== null && value !== undefined && value !== "") {
      normalized.set(key, value)
    }
  })
  return normalized.toString()
}

function getCachedList(key: string) {
  const cached = listCache.get(key)
  if (cached && cached.expires > Date.now()) {
    return cached.payload
  }
  listCache.delete(key)
  return null
}

function setCachedList(key: string, payload: unknown) {
  // Simple pruning to avoid unbounded growth
  if (listCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = listCache.keys().next().value
    if (oldestKey) listCache.delete(oldestKey)
  }
  listCache.set(key, { expires: Date.now() + LIST_CACHE_TTL_MS, payload })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cacheKey = buildCacheKey(searchParams)
    const cached = cacheKey ? getCachedList(cacheKey) : null
    if (cached) {
      const res = NextResponse.json(cached)
      res.headers.set("x-cache", "hit")
      res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
      return res
    }

    const category = searchParams.get("category")
    const categoryId = searchParams.get("categoryId")
    const collection = searchParams.get("collection")
    const collectionId = searchParams.get("collectionId")
    const tag = searchParams.get("tag")
    const type = searchParams.get("type")
    const limit = Number(searchParams.get("limit") || 24)
    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 60) : 24
    const priceMinParam = searchParams.get("priceMin")
    const priceMaxParam = searchParams.get("priceMax")
    const priceMin = priceMinParam !== null ? Number(priceMinParam) : undefined
    const priceMax = priceMaxParam !== null ? Number(priceMaxParam) : undefined
    const dealsOnly = searchParams.get("dealsOnly") === "1"
    const debugRaw =
      process.env.NODE_ENV !== "production" &&
      searchParams.get("debug") === "1"
    if (!category && !categoryId && !collection && !collectionId && !tag && !type) return NextResponse.json({ products: [] })

    let products
    if (type) {
      products = await fetchProductsByType(type, normalizedLimit)
      // Fallback: if no products by type, try category with same label
      if (!products || products.length === 0) {
        const cat = await findCategoryByTitleOrHandle(type)
        if (cat?.id) {
          try {
            products = await fetchProductsByCategoryId(cat.id, normalizedLimit)
          } catch (err) {
            console.warn("fallback fetchProductsByCategoryId failed (type)", err)
          }
        }
      }
    } else if (tag) {
      products = await fetchProductsByTag(tag, normalizedLimit)
      // Fallback: if no products by tag, try matching a category with the same label
      if (!products || products.length === 0) {
        const cat = await findCategoryByTitleOrHandle(tag)
        if (cat?.id) {
          try {
            products = await fetchProductsByCategoryId(cat.id, normalizedLimit)
          } catch (err) {
            console.warn("fallback fetchProductsByCategoryId failed (tag)", err)
          }
        }
      }
    } else if (collection || collectionId) {
      const colId =
        collectionId ||
        (await (async () => {
          if (!collection) return undefined
          const col = await findCollectionByTitleOrHandle(collection)
          return col?.id
        })())
      if (!colId) return NextResponse.json({ products: [] })
      products = await fetchProductsByCollectionId(colId, normalizedLimit)
    } else {
      const catId =
        categoryId ||
        (await (async () => {
          if (!category) return undefined
          const cat = await findCategoryByTitleOrHandle(category)
          return cat?.id
        })())
      if (!catId) return NextResponse.json({ products: [] })
      products = await fetchProductsByCategoryId(catId, normalizedLimit)
    }
    if (debugRaw) {
      return NextResponse.json({ products })
    }

    const normalizedPriceMin =
      typeof priceMin === "number" && Number.isFinite(priceMin)
        ? priceMin
        : undefined
    const normalizedPriceMax =
      typeof priceMax === "number" && Number.isFinite(priceMax)
        ? priceMax
        : undefined

    // Fetch price list (Special Prices) to apply discounts
    const priceListPrices = await getPriceListPrices()
    
    let ui = products.map((product) => {
      // Apply price list discount if available
      const variantId = product.variants?.[0]?.id
      if (variantId && priceListPrices.has(variantId) && product.variants?.[0]) {
        // Both price list and variant prices are in Rupees (major units) usually
        const discountedPrice = priceListPrices.get(variantId)!
        
        // Prioritize Medusa's computed original_price, fallback to raw variant price
        const originalPrice = product.price?.original_price || product.variants[0].prices?.[0]?.amount || discountedPrice
        
        // Create product with price override (in Rupees)
        const productWithDiscount: typeof product = {
          ...product,
          price: {
            calculated_price: discountedPrice,
            original_price: originalPrice,
          },
        }
        
        // computeUiPrice (inside toUiProduct) now handles the "x100 MRP" correction globally
        const uiProduct = toUiProduct(productWithDiscount)
        
        console.log('💰 [PRICE DEBUG]', {
          title: product.title?.substring(0, 35),
          discountedPrice,
          originalPrice,
          '→ UI_price': uiProduct.price,
          '→ UI_mrp': uiProduct.mrp,
          '→ UI_discount': uiProduct.discount + '%'
        })
        return uiProduct
      }
      const uiProduct = toUiProduct(product)
      console.log('💰 [PRICE DEBUG]', {
        title: product.title?.substring(0, 35),
        medusa_calculated: product.price?.calculated_price,
        medusa_original: product.price?.original_price,
        '→ UI_price': uiProduct.price,
        '→ UI_mrp': uiProduct.mrp,
        '→ UI_discount': uiProduct.discount + '%'
      })
      return uiProduct
    })

    if (normalizedPriceMin !== undefined) {
      ui = ui.filter((product) => product.price >= normalizedPriceMin)
    }
    if (normalizedPriceMax !== undefined) {
      ui = ui.filter((product) => product.price <= normalizedPriceMax)
    }
    if (dealsOnly) {
      ui = ui.filter((product) => product.limitedDeal)
    }

    const payload = { products: ui }
    if (cacheKey) {
      setCachedList(cacheKey, payload)
    }
    const res = NextResponse.json(payload)
    res.headers.set("x-cache", "miss")
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
    return res
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PriceOverride type and caching removed - using Medusa prices only



// buildPriceOverrides function removed - using Medusa prices only
