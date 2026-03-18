import { NextRequest, NextResponse } from "next/server"
import { searchProducts } from "@/services/medusa/searchService"

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
        const results = await searchProducts(query, { limit })
        return NextResponse.json(results)
    } catch (error) {
        console.error("❌ Search API error:", error)
        return NextResponse.json(
            { error: "Search failed" },
            { status: 500 }
        )
    }
}
