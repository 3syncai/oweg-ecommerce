import { NextRequest, NextResponse } from "next/server"
import {
  findCategoryByTitleOrHandle,
  findCollectionByTitleOrHandle,
  searchProducts,
  toUiProduct,
  isMedusaProductInStock,
} from "@/lib/medusa"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q") || ""
    const limitRaw = Number(searchParams.get("limit") || 10)
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(Math.floor(limitRaw), 60))
      : 10
    const pageRaw = Number(searchParams.get("page") || "1")
    const offsetRaw = Number(searchParams.get("offset") || "0")
    const page =
      Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1
    const offsetFromParam =
      Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0
    const offset = offsetFromParam > 0 ? offsetFromParam : (page - 1) * limit

    const category = searchParams.get("category")
    const categoryId = searchParams.get("categoryId")
    const collection = searchParams.get("collection")
    const collectionId = searchParams.get("collectionId")
    if (!q.trim()) return NextResponse.json({ products: [], count: 0, limit, offset, hasMore: false })

    let catId = categoryId || undefined
    let colId = collectionId || undefined

    if (!catId && category) {
      const c = await findCategoryByTitleOrHandle(category)
      catId = c?.id
    }
    if (!colId && collection) {
      const c = await findCollectionByTitleOrHandle(collection)
      colId = c?.id
    }

    const result = await searchProducts({
      q,
      limit,
      offset,
      categoryId: catId,
      collectionId: colId,
    })
    const ui = result.products.filter(isMedusaProductInStock).map((p) => toUiProduct(p))
    return NextResponse.json({
      products: ui,
      count: result.count,
      limit,
      offset,
      hasMore: offset + limit < result.count,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
