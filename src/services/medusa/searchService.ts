import { getMeiliClient, getProductsIndexName } from "@/lib/meilisearch"
import { normalizeSearchQuery, rewriteSearchTypos } from "@/lib/search-query-normalize"

export type SearchOptions = {
  limit?: number
  offset?: number
  categoryId?: string
  collectionId?: string
  /** Match against indexed category_titles when id is unknown (handle/title). */
  category?: string
}

export type SearchProductsResult = {
  hits: SearchHit[]
  total: number
}

export type SearchHit = {
  id: string
  handle?: string
  title?: string
  subtitle?: string
  description?: string
  thumbnail?: string | null
  brand?: string
  price?: number
  mrp?: number
  discount?: number
  in_stock?: boolean
  rating?: number
  popularity_score?: number
  status?: string
}

type ScopeFilters = {
  categoryId?: string
  collectionId?: string
  category?: string
}

function significantTokens(normalizedQuery: string): string {
  return normalizedQuery
    .split(" ")
    .filter((t) => t.length >= 2)
    .join(" ")
}

function quoteFilterValue(value: string): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function buildFilter(scope: ScopeFilters): string[] {
  const filters = ['status = "published"', "in_stock = true"]

  if (scope.categoryId?.trim()) {
    filters.push(`category_ids = ${quoteFilterValue(scope.categoryId.trim())}`)
  } else if (scope.category?.trim()) {
    filters.push(`category_titles = ${quoteFilterValue(scope.category.trim())}`)
  }

  if (scope.collectionId?.trim()) {
    filters.push(`collection_id = ${quoteFilterValue(scope.collectionId.trim())}`)
  }

  return filters
}

function isInStockHit(product: SearchHit): boolean {
  if (typeof product.in_stock === "boolean") return product.in_stock
  return false
}

function mapHits(hits: Array<Record<string, unknown>> | undefined): SearchHit[] {
  if (!Array.isArray(hits) || hits.length === 0) return []
  return hits.map((hit) => ({
    id: String(hit.id ?? ""),
    handle: hit.handle ? String(hit.handle) : undefined,
    title: hit.title ? String(hit.title) : undefined,
    subtitle: hit.subtitle ? String(hit.subtitle) : undefined,
    description: hit.description ? String(hit.description) : undefined,
    thumbnail: (hit.thumbnail as string | null | undefined) ?? null,
    brand: hit.brand ? String(hit.brand) : undefined,
    price: typeof hit.price === "number" ? hit.price : undefined,
    mrp: typeof hit.mrp === "number" ? hit.mrp : undefined,
    discount: typeof hit.discount === "number" ? hit.discount : undefined,
    in_stock: typeof hit.in_stock === "boolean" ? hit.in_stock : undefined,
    rating: typeof hit.rating === "number" ? hit.rating : undefined,
    popularity_score:
      typeof hit.popularity_score === "number" ? hit.popularity_score : undefined,
    status: hit.status ? String(hit.status) : undefined,
  }))
}

async function runSearch(
  normalizedQuery: string,
  scope: ScopeFilters,
  limit: number,
  offset = 0
): Promise<{ hits: SearchHit[]; total: number }> {
  try {
    const client = getMeiliClient()
    const index = client.index(getProductsIndexName())
    const result = await index.search(normalizedQuery, {
      limit,
      offset: Math.max(0, offset),
      filter: buildFilter(scope),
      attributesToRetrieve: [
        "id",
        "handle",
        "title",
        "subtitle",
        "description",
        "thumbnail",
        "brand",
        "price",
        "mrp",
        "discount",
        "in_stock",
        "rating",
        "popularity_score",
        "status",
      ],
    })

    const hits = mapHits(result.hits as Array<Record<string, unknown>>)
    const total =
      typeof result.estimatedTotalHits === "number"
        ? result.estimatedTotalHits
        : typeof (result as { totalHits?: number }).totalHits === "number"
          ? (result as { totalHits: number }).totalHits
          : hits.length + Math.max(0, offset)

    return { hits, total }
  } catch (error) {
    console.error("❌ Meilisearch query error:", error)
    return { hits: [], total: 0 }
  }
}

function mergeHitsById(hitLists: SearchHit[][], limit: number): SearchHit[] {
  const merged: SearchHit[] = []
  const seen = new Set<string>()
  for (const list of hitLists) {
    for (const hit of list) {
      if (!hit.id || seen.has(hit.id)) continue
      seen.add(hit.id)
      merged.push(hit)
      if (merged.length >= limit) return merged
    }
  }
  return merged
}

export async function searchProducts(
  query: string,
  options: SearchOptions = {}
): Promise<SearchProductsResult> {
  const rawNormalized = normalizeSearchQuery(query)
  const rewritten = rewriteSearchTypos(rawNormalized)
  const limit = Math.max(1, Math.min(options.limit ?? 48, 100))
  const MAX_SEARCH_OFFSET = 9900
  const rawOffset = Number.isFinite(options.offset as number)
    ? Math.floor(options.offset as number)
    : 0
  const offset = Math.max(0, Math.min(rawOffset, MAX_SEARCH_OFFSET))
  const scope: ScopeFilters = {
    categoryId: options.categoryId,
    collectionId: options.collectionId,
    category: options.category,
  }

  try {
    if (!rawNormalized) return { hits: [], total: 0 }

    let result = await runSearch(rewritten, scope, limit, offset)
    if (result.hits.length > 0) return result

    if (rewritten !== rawNormalized) {
      result = await runSearch(rawNormalized, scope, limit, offset)
      if (result.hits.length > 0) return result
    }

    const tokensOnly = significantTokens(rewritten)
    if (tokensOnly && tokensOnly !== rewritten) {
      result = await runSearch(tokensOnly, scope, limit, offset)
      if (result.hits.length > 0) return result
    }

    const parts = significantTokens(rewritten).split(" ").filter(Boolean).slice(0, 4)
    if (parts.length > 1) {
      const lists = await Promise.all(
        parts.map((part) => runSearch(part, scope, limit + offset, 0))
      )
      const merged = mergeHitsById(
        lists.map((l) => l.hits),
        limit + offset
      )
      if (merged.length > 0) {
        return {
          hits: merged.slice(offset, offset + limit),
          total: Math.max(...lists.map((l) => l.total), merged.length),
        }
      }
    }

    console.log("⚠️ No results found for query:", rawNormalized, "(rewritten:", rewritten + ")")
    return { hits: [], total: 0 }
  } catch (error) {
    console.error("❌ searchProducts error:", error)
    return { hits: [], total: 0 }
  }
}

export { isInStockHit }
