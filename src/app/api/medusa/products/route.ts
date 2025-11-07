import { NextRequest, NextResponse } from "next/server"
import {
  findCategoryByTitleOrHandle,
  fetchProductsByCategoryId,
  fetchProductsByTag,
  fetchProductsByType,
  toUiProduct,
} from "@/lib/medusa"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get("category")
    const categoryId = searchParams.get("categoryId")
    const tag = searchParams.get("tag")
    const type = searchParams.get("type")
    const limit = Number(searchParams.get("limit") || 20)
    if (!category && !categoryId && !tag && !type) return NextResponse.json({ products: [] })

    let products
    if (type) {
      products = await fetchProductsByType(type, limit)
      // Fallback: if no products by type, try category with same label
      if (!products || products.length === 0) {
        const cat = await findCategoryByTitleOrHandle(type)
        if (cat?.id) {
          try {
            products = await fetchProductsByCategoryId(cat.id, limit)
          } catch {}
        }
      }
    } else if (tag) {
      products = await fetchProductsByTag(tag, limit)
      // Fallback: if no products by tag, try matching a category with the same label
      if (!products || products.length === 0) {
        const cat = await findCategoryByTitleOrHandle(tag)
        if (cat?.id) {
          try {
            products = await fetchProductsByCategoryId(cat.id, limit)
          } catch {}
        }
      }
    } else {
      const catId = categoryId || (await (async () => {
        if (!category) return undefined
        const cat = await findCategoryByTitleOrHandle(category)
        return cat?.id
      })())
      if (!catId) return NextResponse.json({ products: [] })
      products = await fetchProductsByCategoryId(catId, limit)
    }
    const ui = products.map(toUiProduct)
    return NextResponse.json({ products: ui })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
