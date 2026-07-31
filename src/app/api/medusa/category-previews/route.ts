import { NextRequest, NextResponse } from "next/server"
import { buildCategoryPreviewImages } from "@/lib/category-listing"

export const revalidate = 120

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const idParam = searchParams.get("categoryIds")

  if (!idParam) {
    return NextResponse.json({ previews: {} })
  }

  const ids = idParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  const previews = await buildCategoryPreviewImages(ids)
  const response = NextResponse.json({ previews })
  response.headers.set(
    "Cache-Control",
    "public, s-maxage=120, stale-while-revalidate=600"
  )
  return response
}
