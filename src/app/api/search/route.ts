import { NextRequest, NextResponse } from "next/server"
import {
  searchProducts as searchProductsMeili,
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
import { parseSearchFilters, hasSearchFilters, searchRecallTerm, matchesSearchWords, matchesSearchFilters } from "@/lib/search-filters"
import { rewriteSearchTypos } from "@/lib/search-query-normalize"
import { parseProductSort, sortProductsByPrice } from "@/lib/product-sort"
import {
  MEDUSA_LIST_MAX_LIMIT,
  overfetchLimit,
  sliceFilteredPage,
} from "@/lib/paginated-in-stock"

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

function mapSearchHit(hit: SearchHit): SearchApiProduct {
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
  const sort = parseProductSort(searchParams.get("sort"))
  const pageRaw = Number(searchParams.get("page") || "1")
  const pageSizeRaw = Number(
    searchParams.get("pageSize") || searchParams.get("limit") || "24"
  )
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1
  const pageSize = Number.isFinite(pageSizeRaw)
    ? Math.max(1, Math.min(Math.floor(pageSizeRaw), 60))
    : 24
  // Meilisearch maxTotalHits is configured at 10000; keep offset under it.
  const MAX_SEARCH_RESULTS = 10000
  const offset = (page - 1) * pageSize
  if (offset >= MAX_SEARCH_RESULTS) return NextResponse.json({ error: "Please refine your search to see more results" }, { status: 400 })

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

  let filters
  try { filters = parseSearchFilters(searchParams) } catch {
    return NextResponse.json({ error: 'Invalid search filters' }, { status: 400 })
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

    let indexUnavailable = false
    const needsCompleteFallback = sort !== "default" || hasSearchFilters(filters)
    const meiliResults = await searchProductsMeili(searchQuery, {
      limit: pageSize,
      offset,
      categoryId,
      collectionId,
      category: !categoryId ? category : undefined,
      ...filters,
      sort,
    }).catch(() => { indexUnavailable = true; return { hits: [] as SearchHit[], total: 0, brands: [] as string[] } })

    if (!indexUnavailable && (meiliResults.total > 0 || hasSearchFilters(filters))) {
      // in_stock is filtered in Meilisearch; keep post-filter for stale index docs.
      const inStockHits = meiliResults.hits.filter(isInStockHit).map(mapSearchHit)

      {
        const count = Math.min(meiliResults.total, MAX_SEARCH_RESULTS)
        return NextResponse.json({
          products: inStockHits,
          count,
          brands: meiliResults.brands || [],
          page,
          pageSize,
          hasMore: offset + pageSize < count,
          countIsApproximate: inStockHits.length < meiliResults.hits.length,
        })
      }
    }

    try {
      // Medusa list max is 60; align page size so we never slice past the fetch window.
      const medusaPageSize = Math.min(pageSize, MEDUSA_LIST_MAX_LIMIT)
      const fetchLimit = overfetchLimit(medusaPageSize, MEDUSA_LIST_MAX_LIMIT)
      let medusaResult = await searchProductsMedusa({
        q: searchQuery,
        limit: needsCompleteFallback ? MEDUSA_LIST_MAX_LIMIT : fetchLimit,
        offset: needsCompleteFallback ? 0 : offset,
        categoryId,
        collectionId,
      })
      let recallApproximate = false
      // Medusa q is contiguous text; require every word after a bounded anchor lookup.
      const recallTerm = searchRecallTerm(searchQuery)
      if (!medusaResult.count && recallTerm !== searchQuery) {
        const recalled = await searchProductsMedusa({ q: recallTerm, limit: MEDUSA_LIST_MAX_LIMIT, offset: 0, categoryId, collectionId })
        const matched = recalled.products.filter(product => isMedusaProductInStock(product) && matchesSearchWords(`${product.title || ''} ${product.subtitle || ''}`, searchQuery))
        recallApproximate = recalled.count > recalled.products.length
        if (recallApproximate && !matched.length) throw new Error("Incomplete fallback cannot establish an empty result")
        medusaResult = { products: needsCompleteFallback ? matched : matched.slice(offset, offset + fetchLimit), count: matched.length }
      }
      const fallbackFiltered: SearchApiProduct[] = medusaResult.products
        .filter(isMedusaProductInStock)
        .map((product) => {
          const ui = toUiProduct(product)
          return {
            id: String(ui.id),
            handle: ui.handle,
            title: ui.name,
            thumbnail: ui.image,
            brand: ui.brand,
            price: ui.price,
            mrp: ui.mrp,
            discount: ui.discount,
            status: "published",
            in_stock: true,
            inventory_quantity: ui.inventory_quantity,
          }
        })

      if (needsCompleteFallback) {
        // A complete small Medusa result can be filtered globally even during index downtime.
        // Never pretend a capped first window represents a larger catalogue.
        if (recallApproximate || medusaResult.count > medusaResult.products.length) throw new Error('Index required for complete filtered results')
        const matched = sortProductsByPrice(fallbackFiltered.filter(product => matchesSearchFilters(product, filters)), sort)
        return NextResponse.json({ products: matched.slice(offset, offset + medusaPageSize), count: matched.length,
          brands: Array.from(new Set(fallbackFiltered.map(product => product.brand).filter(Boolean))),
          page, pageSize: medusaPageSize, hasMore: offset + medusaPageSize < matched.length, countIsApproximate: false })
      }

      const sliced = sliceFilteredPage({
        filtered: fallbackFiltered,
        fetchedCount: medusaResult.products.length,
        pageLimit: medusaPageSize,
        offset,
        fetchLimit,
        upstreamCount: medusaResult.count,
      })

      return NextResponse.json({
        products: sliced.products,
        count: sliced.count,
        page,
        pageSize: medusaPageSize,
        hasMore: sliced.hasMore,
        countIsApproximate: recallApproximate || sliced.countIsApproximate,
        brands: [],
      })
    } catch (medusaError) {
      console.error("❌ Medusa search fallback error:", medusaError)
      return NextResponse.json({ error: 'Search is temporarily unavailable. Please retry.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' } })
    }
  } catch (error) {
    console.error("❌ Search API error:", error)
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    )
  }
}
