import client from "@/lib/opensearch"
import { normalizeSearchQuery, rewriteSearchTypos } from "@/lib/search-query-normalize"

export type SearchOptions = {
  limit?: number
  categoryId?: string
  collectionId?: string
  /** Match against indexed category_titles when id is unknown (handle/title). */
  category?: string
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

function buildScopeFilters(scope: ScopeFilters) {
  const filters: Record<string, unknown>[] = [{ term: { status: "published" } }]

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
                fuzziness: "AUTO",
                prefix_length: 1,
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
                fuzziness: "AUTO",
                prefix_length: 0,
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
async function runSearch(normalizedQuery: string, scope: ScopeFilters, limit: number): Promise<SearchHit[]> {
  try {
    const response = await client.search({
      index: "products",
      size: limit,
      _source: SOURCE_FIELDS,
      body: {
        query: buildUnifiedQuery(normalizedQuery, scope) as any,
        track_total_hits: false,
      },
    })
    return mapHits(response)
  } catch (error) {
    console.error("❌ OpenSearch query error:", error)
    return []
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

export async function searchProducts(query: string, options: SearchOptions = {}) {
  const rawNormalized = normalizeSearchQuery(query)
  const rewritten = rewriteSearchTypos(rawNormalized)
  const limit = Math.max(1, Math.min(options.limit ?? 48, 100))
  const scope: ScopeFilters = {
    categoryId: options.categoryId,
    collectionId: options.collectionId,
    category: options.category,
  }

  try {
    if (!rawNormalized) return []

    // Prefer typo-corrected query first.
    let hits = await runSearch(rewritten, scope, limit)
    if (hits.length > 0) return hits

    if (rewritten !== rawNormalized) {
      hits = await runSearch(rawNormalized, scope, limit)
      if (hits.length > 0) return hits
    }

    const tokensOnly = significantTokens(rewritten)
    if (tokensOnly && tokensOnly !== rewritten) {
      hits = await runSearch(tokensOnly, scope, limit)
      if (hits.length > 0) return hits
    }

    // Parallel per-token merge (cap 4) — avoids sequential fan-out on misses.
    const parts = significantTokens(rewritten).split(" ").filter(Boolean).slice(0, 4)
    if (parts.length > 1) {
      const lists = await Promise.all(parts.map((part) => runSearch(part, scope, limit)))
      const merged = mergeHitsById(lists, limit)
      if (merged.length > 0) return merged
    }

    console.log("⚠️ No results found for query:", rawNormalized, "(rewritten:", rewritten + ")")
    return []
  } catch (error) {
    console.error("❌ OpenSearch error:", error)
    return []
  }
}

export { isInStockHit }
