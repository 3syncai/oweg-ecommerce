import client from "@/lib/opensearch"
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

const SOURCE_FIELDS = [
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
  "category_ids",
  "collection_id",
]

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

/** Explicit fuzziness for short catalog tokens (3–6 chars); AUTO otherwise. */
function fuzzinessForQuery(normalizedQuery: string): 1 | 2 | "AUTO" {
  const tokens = normalizedQuery.split(" ").filter(Boolean)
  if (tokens.length === 0) return "AUTO"
  const shortCatalog = tokens.every((t) => t.length >= 3 && t.length <= 6)
  if (!shortCatalog) return "AUTO"
  // Single short token: allow up to 2 edits (fane→fan, faan→fan after collapse)
  if (tokens.length === 1) return 2
  return 1
}

function buildScopeFilters(scope: ScopeFilters) {
  const filters: Record<string, unknown>[] = [
    { term: { status: "published" } },
    // Keep storefront totals/pagination aligned with sellable hits.
    { term: { in_stock: true } },
  ]

  if (scope.categoryId?.trim()) {
    filters.push({ term: { category_ids: scope.categoryId.trim() } })
  } else if (scope.category?.trim()) {
    filters.push({
      match: {
        category_titles: {
          query: scope.category.trim(),
          operator: "and",
        },
      },
    })
  }

  if (scope.collectionId?.trim()) {
    filters.push({ term: { collection_id: scope.collectionId.trim() } })
  }

  return filters
}

function buildUnifiedQuery(normalizedQuery: string, scope: ScopeFilters) {
  const fuzziness = fuzzinessForQuery(normalizedQuery)

  return {
    function_score: {
      query: {
        bool: {
          filter: buildScopeFilters(scope),
          should: [
            // Primary-tier clauses (higher boosts)
            {
              multi_match: {
                query: normalizedQuery,
                fields: ["title^18", "brand^10"],
                type: "phrase",
                boost: 10,
              },
            },
            {
              multi_match: {
                query: normalizedQuery,
                fields: [
                  "title^12",
                  "title.prefix^8",
                  "brand^6",
                  "category_titles^3",
                  "description^1.2",
                ],
                type: "best_fields",
                operator: "or",
                minimum_should_match: 1,
                boost: 4,
              },
            },
            {
              multi_match: {
                query: normalizedQuery,
                fields: ["title.prefix^10", "title^6"],
                type: "phrase_prefix",
                boost: 3,
              },
            },
            {
              multi_match: {
                query: normalizedQuery,
                fields: ["title^5", "brand^3"],
                type: "best_fields",
                fuzziness,
                prefix_length: 1,
                fuzzy_transpositions: true,
                max_expansions: 50,
                operator: "or",
                boost: 1.8,
              },
            },
            // Wide-fallback clauses (lower boosts) — same round trip
            {
              multi_match: {
                query: normalizedQuery,
                fields: ["title^6", "brand^4", "category_titles^2", "description", "title.prefix^5"],
                type: "best_fields",
                operator: "or",
                minimum_should_match: 1,
                boost: 2,
              },
            },
            {
              multi_match: {
                query: normalizedQuery,
                fields: ["title^4", "brand^2"],
                type: "best_fields",
                fuzziness,
                prefix_length: 0,
                fuzzy_transpositions: true,
                max_expansions: 50,
                operator: "or",
                minimum_should_match: 1,
                boost: 1.4,
              },
            },
          ],
          minimum_should_match: 1,
        },
      },
      score_mode: "sum",
      boost_mode: "sum",
      functions: [
        { filter: { term: { in_stock: true } }, weight: 2.0 },
        { field_value_factor: { field: "popularity_score", factor: 0.15, missing: 0 } },
        { field_value_factor: { field: "rating", factor: 0.2, missing: 0 } },
        { field_value_factor: { field: "sales_30d", factor: 0.03, missing: 0 } },
        {
          gauss: {
            created_at: {
              origin: "now",
              scale: "60d",
              offset: "7d",
              decay: 0.4,
            },
          },
          weight: 0.4,
        },
      ],
    },
  }
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

function isInStockHit(product: SearchHit): boolean {
  if (typeof product.in_stock === "boolean") return product.in_stock
  return false
}

function mapHits(response: any): SearchHit[] {
  const hits = (response.body ?? response).hits?.hits
  if (!Array.isArray(hits) || hits.length === 0) return []
  return hits.map((hit: any) => hit._source as SearchHit)
}

/** Single OpenSearch round trip (primary + wide clauses combined). */
async function runSearch(
  normalizedQuery: string,
  scope: ScopeFilters,
  limit: number,
  offset = 0
): Promise<{ hits: SearchHit[]; total: number }> {
  try {
    const response = await client.search({
      index: "products",
      from: Math.max(0, offset),
      size: limit,
      _source: SOURCE_FIELDS,
      body: {
        query: buildUnifiedQuery(normalizedQuery, scope) as any,
        track_total_hits: true,
      },
    })
    const body = response.body ?? response
    const hits = mapHits(response)
    const totalRaw = body.hits?.total
    const total =
      typeof totalRaw === "number"
        ? totalRaw
        : typeof totalRaw?.value === "number"
          ? totalRaw.value
          : hits.length + Math.max(0, offset)
    return { hits, total }
  } catch (error) {
    console.error("❌ OpenSearch query error:", error)
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

    // Prefer typo-corrected query first.
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

    // Parallel per-token merge (cap 4) — avoids sequential fan-out on misses.
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
