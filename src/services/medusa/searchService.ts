import { searchFilterExpressions, type SearchFilters } from "@/lib/search-filters"
import { getMeiliClient, getProductsIndexName } from "@/lib/meilisearch"
import { normalizeSearchQuery, rewriteSearchTypos } from "@/lib/search-query-normalize"

export type SearchOptions = SearchFilters & {
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
  brands?: string[]
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

type ScopeFilters = SearchFilters & {
  categoryId?: string
  collectionId?: string
  category?: string
}

function quoteFilterValue(value: string): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function buildFilter(scope: ScopeFilters): string[] {
  const filters = ['status = "published"', "in_stock = true", ...searchFilterExpressions(scope)]

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
): Promise<SearchProductsResult> {
    const client = getMeiliClient()
    const index = client.index(getProductsIndexName())
    const result = await index.search(normalizedQuery, {
      limit,
      offset: Math.max(0, offset),
      filter: buildFilter(scope),
      facets: ["brand"],
      matchingStrategy: "all",
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

    return { hits, total, brands: Object.keys(result.facetDistribution?.brand || {}) }
}

export async function searchProducts(query: string, options: SearchOptions = {}): Promise<SearchProductsResult> {
  const normalized = normalizeSearchQuery(query)
  if (!normalized) return { hits: [], total: 0, brands: [] }
  const rewritten = rewriteSearchTypos(normalized)
  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 24), 100))
  const offset = Math.max(0, Math.min(Math.floor(options.offset || 0), 9999))
  const result = await runSearch(rewritten, options, limit, offset)
  // A later empty page is not a new query. Preserve its real total and filters.
  if (result.total > 0 || rewritten === normalized) return result
  return runSearch(normalized, options, limit, offset)
}

export { isInStockHit }
