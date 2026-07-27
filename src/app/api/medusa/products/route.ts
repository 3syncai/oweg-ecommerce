import { NextRequest, NextResponse } from "next/server"
import {
  findCategoryByTitleOrHandle,
  findCollectionByTitleOrHandle,
  fetchProductsByCategoryId,
  fetchProductsByCollectionId,
  fetchProductsByTag,
  fetchProductsByType,
  toUiProduct,
  isMedusaProductInStock,
  type MedusaProduct,
  type MedusaProductListResult,
} from "@/lib/medusa"
import { getPriceListPrices } from "@/lib/price-lists"

export const dynamic = "force-dynamic"

const LIST_CACHE_TTL_MS = 1000 * 60 // 1 minute cache for list responses
const MAX_CACHE_ENTRIES = 200
type CachedList = { expires: number; payload: unknown }
const listCache = new Map<string, CachedList>()

function buildCacheKey(searchParams: URLSearchParams) {
  const normalized = new URLSearchParams()
  ;[
    "category",
    "categoryId",
    "collection",
    "collectionId",
    "tag",
    "type",
    "limit",
    "offset",
    "priceMin",
    "priceMax",
    "dealsOnly",
    "includeSubcategories",
  ].forEach((key) => {
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
  if (listCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = listCache.keys().next().value
    if (oldestKey) listCache.delete(oldestKey)
  }
  listCache.set(key, { expires: Date.now() + LIST_CACHE_TTL_MS, payload })
}

const EMPTY_LIST: MedusaProductListResult = { products: [], count: 0 }

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
    const offsetRaw = Number(searchParams.get("offset") || 0)
    const normalizedOffset =
      Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0
    const priceMinParam = searchParams.get("priceMin")
    const priceMaxParam = searchParams.get("priceMax")
    const priceMin = priceMinParam !== null ? Number(priceMinParam) : undefined
    const priceMax = priceMaxParam !== null ? Number(priceMaxParam) : undefined
    const dealsOnly = searchParams.get("dealsOnly") === "1"
    const includeSubcategories = searchParams.get("includeSubcategories") === "1"
    const debugRaw =
      process.env.NODE_ENV !== "production" && searchParams.get("debug") === "1"
    if (!category && !categoryId && !collection && !collectionId && !tag && !type) {
      return NextResponse.json({
        products: [],
        count: 0,
        limit: normalizedLimit,
        offset: normalizedOffset,
        hasMore: false,
      })
    }

    let listResult: MedusaProductListResult = EMPTY_LIST
    if (type) {
      listResult = await fetchProductsByType(type, normalizedLimit, normalizedOffset)
      if (!listResult.products.length) {
        const cat = await findCategoryByTitleOrHandle(type)
        if (cat?.id) {
          try {
            listResult = await fetchProductsByCategoryId(cat.id, normalizedLimit, {
              offset: normalizedOffset,
            })
          } catch (err) {
            console.warn("fallback fetchProductsByCategoryId failed (type)", err)
          }
        }
      }
    } else if (tag) {
      listResult = await fetchProductsByTag(tag, normalizedLimit, normalizedOffset)
      if (!listResult.products.length) {
        const cat = await findCategoryByTitleOrHandle(tag)
        if (cat?.id) {
          try {
            listResult = await fetchProductsByCategoryId(cat.id, normalizedLimit, {
              offset: normalizedOffset,
            })
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
      if (!colId) {
        return NextResponse.json({
          products: [],
          count: 0,
          limit: normalizedLimit,
          offset: normalizedOffset,
          hasMore: false,
        })
      }
      listResult = await fetchProductsByCollectionId(colId, normalizedLimit, normalizedOffset)
    } else {
      const catId =
        categoryId ||
        (await (async () => {
          if (!category) return undefined
          const cat = await findCategoryByTitleOrHandle(category)
          return cat?.id
        })())
      if (!catId) {
        return NextResponse.json({
          products: [],
          count: 0,
          limit: normalizedLimit,
          offset: normalizedOffset,
          hasMore: false,
        })
      }
      listResult = await fetchProductsByCategoryId(catId, normalizedLimit, {
        includeSubcategories,
        offset: normalizedOffset,
      })
    }

    const products = listResult.products
    const medusaCount = listResult.count

    if (debugRaw) {
      return NextResponse.json({
        products,
        count: medusaCount,
        limit: normalizedLimit,
        offset: normalizedOffset,
      })
    }

    const normalizedPriceMin =
      typeof priceMin === "number" && Number.isFinite(priceMin) ? priceMin : undefined
    const normalizedPriceMax =
      typeof priceMax === "number" && Number.isFinite(priceMax) ? priceMax : undefined

    const priceListPrices = await getPriceListPrices()
    const inStockProducts = products.filter(isMedusaProductInStock)

    let ui: ReturnType<typeof toUiProduct>[] = inStockProducts.map((product: MedusaProduct) => {
      const variantId = product.variants?.[0]?.id
      if (variantId && priceListPrices.has(variantId) && product.variants?.[0]) {
        const discountedPrice = priceListPrices.get(variantId)!
        const originalPrice =
          product.price?.original_price ||
          product.variants[0].prices?.[0]?.amount ||
          discountedPrice
        const productWithDiscount: typeof product = {
          ...product,
          price: {
            calculated_price: discountedPrice,
            original_price: originalPrice,
          },
        }
        return toUiProduct(productWithDiscount)
      }
      return toUiProduct(product)
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

    const count = Math.max(medusaCount, ui.length + normalizedOffset)
    const hasMore = normalizedOffset + normalizedLimit < count

    const payload = {
      products: ui,
      count,
      limit: normalizedLimit,
      offset: normalizedOffset,
      hasMore,
    }
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
