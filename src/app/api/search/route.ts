import { NextRequest, NextResponse } from "next/server"
import {
  searchProducts as searchProductsOpenSearch,
  isInStockHit,
  type SearchHit,
} from "@/services/medusa/searchService"
import {
  searchProducts as searchProductsMedusa,
  toUiProduct,
  isMedusaProductInStock,
  findCategoryByTitleOrHandle,
  findCollectionByTitleOrHandle,
} from "@/lib/medusa"
import { rewriteSearchTypos } from "@/lib/search-query-normalize"

export type SearchApiProduct = {
  id: string
  handle?: string
  title: string
  thumbnail?: string
  brand?: string
  price?: number
  mrp?: number
  discount?: number
  rating?: number
  status: string
  in_stock: boolean
  inventory_quantity?: number
}

function mapOpenSearchHit(hit: SearchHit): SearchApiProduct {
  return {
    id: String(hit.id),
    handle: hit.handle,
    title: hit.title || "",
    thumbnail: hit.thumbnail || undefined,
    brand: hit.brand,
    price: typeof hit.price === "number" ? hit.price : undefined,
    mrp: typeof hit.mrp === "number" ? hit.mrp : undefined,
    discount: typeof hit.discount === "number" ? hit.discount : undefined,
    rating: typeof hit.rating === "number" ? hit.rating : undefined,
    status: hit.status || "published",
    in_stock: hit.in_stock === true,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get("q")
  const pageRaw = Number(searchParams.get("page") || "1")
  const pageSizeRaw = Number(
    searchParams.get("pageSize") || searchParams.get("limit") || "24"
  )
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1
  const pageSize = Number.isFinite(pageSizeRaw)
    ? Math.max(1, Math.min(pageSizeRaw, 100))
    : 24
  // OpenSearch max_result_window is typically 10000; keep from+size under it.
  const MAX_SEARCH_OFFSET = 9900
  const offset = Math.min((page - 1) * pageSize, MAX_SEARCH_OFFSET)

  const category = searchParams.get("category") || undefined
  const categoryIdParam = searchParams.get("categoryId") || undefined
  const collection = searchParams.get("collection") || undefined
  const collectionIdParam = searchParams.get("collectionId") || undefined

  if (!query || query.trim() === "") {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    )
  }

  try {
    const normalized = query.trim()
    const searchQuery = rewriteSearchTypos(normalized) || normalized

    let categoryId = categoryIdParam
    let collectionId = collectionIdParam

    if (!categoryId && category) {
      const resolved = await findCategoryByTitleOrHandle(category).catch(() => undefined)
      categoryId = resolved?.id
    }
    if (!collectionId && collection) {
      const resolved = await findCollectionByTitleOrHandle(collection).catch(() => undefined)
      collectionId = resolved?.id
    }

    const openSearchResults = await searchProductsOpenSearch(searchQuery, {
      limit: pageSize,
      offset,
      categoryId,
      collectionId,
      category: !categoryId ? category : undefined,
    }).catch(() => ({ hits: [] as SearchHit[], total: 0 }))

    if (Array.isArray(openSearchResults.hits) && openSearchResults.hits.length > 0) {
      const inStockOS = openSearchResults.hits.filter(isInStockHit).map(mapOpenSearchHit)

      if (inStockOS.length > 0) {
        const count = Math.max(openSearchResults.total, offset + inStockOS.length)
        return NextResponse.json({
          products: inStockOS,
          count,
          page,
          pageSize,
          hasMore: offset + pageSize < count,
        })
      }
    }

    try {
      const medusaResult = await searchProductsMedusa({
        q: searchQuery,
        limit: pageSize,
        offset,
        categoryId,
        collectionId,
      })
      const fallbackResults: SearchApiProduct[] = medusaResult.products
        .filter(isMedusaProductInStock)
        .map((product) => {
          const ui = toUiProduct(product)
          return {
            id: String(ui.id),
            handle: ui.handle,
            title: ui.name,
            thumbnail: ui.image,
            brand: undefined,
            price: ui.price,
            mrp: ui.mrp,
            discount: ui.discount,
            status: "published",
            in_stock: true,
            inventory_quantity: ui.inventory_quantity,
          }
        })

      const count = Math.max(medusaResult.count, offset + fallbackResults.length)
      return NextResponse.json({
        products: fallbackResults,
        count,
        page,
        pageSize,
        hasMore: offset + pageSize < count,
      })
    } catch (medusaError) {
      console.error("❌ Medusa search fallback error:", medusaError)
      return NextResponse.json({
        products: [],
        count: 0,
        page,
        pageSize,
        hasMore: false,
      })
    }
  } catch (error) {
    console.error("❌ Search API error:", error)
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    )
  }
}
