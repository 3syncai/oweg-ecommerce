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
  const rawLimit = Number(searchParams.get("limit") || "48")
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 100)) : 48

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

    // Primary: OpenSearch (fast + ranked) — use typo-rewritten query
    const openSearchResults = await searchProductsOpenSearch(searchQuery, {
      limit,
      categoryId,
      collectionId,
      // If id resolve failed, still try title match in the index
      category: !categoryId ? category : undefined,
    }).catch(() => [] as SearchHit[])

    if (Array.isArray(openSearchResults) && openSearchResults.length > 0) {
      const inStockOS = openSearchResults
        .filter(isInStockHit)
        .map(mapOpenSearchHit)

      // Only short-circuit when we still have in-stock hits; otherwise fall through.
      if (inStockOS.length > 0) {
        return NextResponse.json(inStockOS)
      }
    }

    // Fallback: direct Medusa search (prevents empty results when index is stale)
    try {
      const medusaProducts = await searchProductsMedusa({
        q: searchQuery,
        limit,
        categoryId,
        collectionId,
      })
      const fallbackResults: SearchApiProduct[] = medusaProducts
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

      return NextResponse.json(fallbackResults)
    } catch (medusaError) {
      console.error("❌ Medusa search fallback error:", medusaError)
      return NextResponse.json([])
    }
  } catch (error) {
    console.error("❌ Search API error:", error)
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    )
  }
}
