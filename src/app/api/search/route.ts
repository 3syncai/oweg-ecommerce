import { NextRequest, NextResponse } from "next/server"
import { searchProducts as searchProductsOpenSearch } from "@/services/medusa/searchService"
import { searchProducts as searchProductsMedusa, toUiProduct } from "@/lib/medusa"

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get("q")
    const rawLimit = Number(searchParams.get("limit") || "48")
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 100)) : 48

    if (!query || query.trim() === "") {
        return NextResponse.json(
            { error: "Query parameter 'q' is required" },
            { status: 400 }
        )
    }

    try {
        const normalized = query.trim()

        // Primary: OpenSearch (fast + ranked)
        const openSearchResults = await searchProductsOpenSearch(normalized, { limit }).catch(() => [])
        if (Array.isArray(openSearchResults) && openSearchResults.length > 0) {
            // Hide out of stock
            const inStockOS = openSearchResults.filter((p: any) => typeof p.inventory_quantity !== 'number' || p.inventory_quantity > 0);
            return NextResponse.json(inStockOS)
        }

        // Fallback: direct Medusa search (prevents empty results when index is stale)
        const medusaProducts = await searchProductsMedusa({ q: normalized, limit })
        const fallbackResults = medusaProducts.map((product) => {
            const ui = toUiProduct(product)
            return {
                id: String(ui.id),
                handle: ui.handle,
                title: ui.name,
                thumbnail: ui.image,
                brand: undefined as string | undefined,
                price: ui.price,
                mrp: ui.mrp,
                discount: ui.discount,
                status: "published",
                inventory_quantity: ui.inventory_quantity,
            }
        })

        // Hide out of stock
        const inStockFallback = fallbackResults.filter(p => typeof p.inventory_quantity !== 'number' || p.inventory_quantity > 0);
        return NextResponse.json(inStockFallback)
    } catch (error) {
        console.error("❌ Search API error:", error)
        return NextResponse.json(
            { error: "Search failed" },
            { status: 500 }
        )
    }
}
