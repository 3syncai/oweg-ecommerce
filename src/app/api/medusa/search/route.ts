import { NextRequest, NextResponse } from "next/server"
import {
  findCategoryByTitleOrHandle,
  findCollectionByTitleOrHandle,
  searchProducts,
  toUiProduct,
} from "@/lib/medusa"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q") || ""
    const limit = Number(searchParams.get("limit") || 10)
    const category = searchParams.get("category")
    const categoryId = searchParams.get("categoryId")
    const collection = searchParams.get("collection")
    const collectionId = searchParams.get("collectionId")
    if (!q.trim()) return NextResponse.json({ products: [] })

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

  const prods = await searchProducts({ q, limit, categoryId: catId, collectionId: colId })
  const ui = prods.map((p) => toUiProduct(p))
    return NextResponse.json({ products: ui })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
