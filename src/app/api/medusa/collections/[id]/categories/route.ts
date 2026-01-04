import { NextRequest, NextResponse } from "next/server"
import { fetchCategoriesForCollection, fetchCollections } from "@/lib/medusa"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params
    let collectionId = id
    // If the param is a handle, resolve it to id
    if (id && !id.startsWith("col_")) {
      try {
        const cols = await fetchCollections()
        const found = cols.find((c) => c.handle === id || (c.title || "").toLowerCase() === id.toLowerCase())
        if (found?.id) collectionId = found.id
      } catch (err) {
        console.warn("failed to resolve collection handle", err)
      }
    }
    const categories = await fetchCategoriesForCollection(collectionId)
    return NextResponse.json({ categories })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
