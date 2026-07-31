import { NextRequest, NextResponse } from "next/server"
import { buildCategoryDealPreview } from "@/lib/category-listing"
import { findCategoryByTitleOrHandle } from "@/lib/medusa"

export const revalidate = 60

export async function GET(req: NextRequest) {
  try {
    const searchParams = new URL(req.url).searchParams
    const categoryIdParam = searchParams.get("categoryId")
    const category = searchParams.get("category")
    const limit = Number(searchParams.get("limit") || "20") || 20
    const includeSubcategories = searchParams.get("includeSubcategories") === "1"

    if (!categoryIdParam && !category) {
      return NextResponse.json({ products: [], total: 0 })
    }

    let categoryId = categoryIdParam || ""
    if (!categoryId && category) {
      const cat = await findCategoryByTitleOrHandle(category)
      categoryId = cat?.id || ""
    }
    if (!categoryId) {
      return NextResponse.json({ products: [], total: 0 })
    }

    const result = await buildCategoryDealPreview(
      categoryId,
      includeSubcategories,
      Math.min(limit, 24)
    )

    const response = NextResponse.json({
      products: result.products,
      total: result.total,
    })
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300"
    )
    return response
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed"
    return NextResponse.json(
      { products: [], total: 0, error: message },
      { status: 500 }
    )
  }
}
