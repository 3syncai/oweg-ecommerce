import client from "@/lib/opensearch"

type SearchOptions = {
    limit?: number
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
]

function buildStrictQuery(normalizedQuery: string) {
    return {
        function_score: {
            query: {
                bool: {
                    filter: [
                        { term: { status: "published" } },
                    ],
                    must: [
                        {
                            multi_match: {
                                query: normalizedQuery,
                                fields: [
                                    "title^14",
                                    "title.prefix^7",
                                    "brand^6",
                                    "category_titles^3",
                                    "description^1.2",
                                ],
                                type: "best_fields",
                                operator: "and",
                            },
                        },
                    ],
                    should: [
                        {
                            multi_match: {
                                query: normalizedQuery,
                                fields: ["title^18", "brand^10"],
                                type: "phrase",
                                boost: 5,
                            },
                        },
                        {
                            multi_match: {
                                query: normalizedQuery,
                                fields: ["title.prefix^8"],
                                type: "phrase_prefix",
                                boost: 2.5,
                            },
                        },
                    ],
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

function buildFallbackQuery(normalizedQuery: string) {
    return {
        function_score: {
            query: {
                bool: {
                    filter: [
                        { term: { status: "published" } },
                    ],
                    should: [
                        {
                            multi_match: {
                                query: normalizedQuery,
                                fields: ["title^8", "brand^5", "category_titles^2", "description"],
                                type: "best_fields",
                                operator: "and",
                            },
                        },
                        {
                            multi_match: {
                                query: normalizedQuery,
                                fields: ["title^3", "brand^2", "description^0.8"],
                                fuzziness: "AUTO",
                                prefix_length: normalizedQuery.length <= 4 ? 1 : 2,
                                max_expansions: 20,
                                operator: "and",
                                boost: 0.45,
                            },
                        },
                    ],
                    minimum_should_match: 1,
                },
            },
            score_mode: "sum",
            boost_mode: "sum",
            functions: [
                { filter: { term: { in_stock: true } }, weight: 1.7 },
                { field_value_factor: { field: "popularity_score", factor: 0.08, missing: 0 } },
                { field_value_factor: { field: "rating", factor: 0.1, missing: 0 } },
            ],
        },
    }
}

export async function searchProducts(query: string, options: SearchOptions = {}) {
    const normalizedQuery = query.trim()
    const limit = Math.max(1, Math.min(options.limit ?? 48, 100))

    try {
        if (!normalizedQuery) return []

        // 1) Strict query first for high precision.
        const strictResponse = await client.search({
            index: "products",
            size: limit,
            _source: SOURCE_FIELDS,
            body: {
                query: buildStrictQuery(normalizedQuery) as any,
                track_total_hits: false,
            },
        })

        const strictHits = (strictResponse.body ?? strictResponse).hits.hits
        if (Array.isArray(strictHits) && strictHits.length > 0) {
            return strictHits.map((hit: any) => hit._source)
        }

        // 2) Fallback with fuzziness only when strict had no results.
        const response = await client.search({
            index: "products",
            size: limit,
            _source: SOURCE_FIELDS,
            body: {
                query: buildFallbackQuery(normalizedQuery) as any,
                track_total_hits: false,
            },
        })

        // Handle both opensearch client v1 (.body) and v2 (no .body)
        const hits = (response.body ?? response).hits.hits

        if (!hits || hits.length === 0) {
            console.log("⚠️ No results found for query:", normalizedQuery)
            return []
        }

        return hits.map((hit: any) => hit._source)

    } catch (error) {
        console.error("❌ OpenSearch error:", error)
        throw error
    }
}
