import { NextRequest, NextResponse } from "next/server"
import { fetchProductsByCategoryId } from "@/lib/medusa"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const idParam = searchParams.get("categoryIds")

  if (!idParam) {
    return NextResponse.json({ previews: {} })
  }

  const ids = Array.from(
    new Set(
      idParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  )

  const previews: Record<
    string,
    { image: string; productId: string }
  > = {}

  await Promise.all(
    ids.map(async (categoryId) => {
      try {
        const products = await fetchProductsByCategoryId(categoryId, 1)
        const product = products[0]
        if (!product) return
        const image =
          product.thumbnail ||
          product.images?.[0]?.url ||
          "/oweg_logo.png"
        previews[categoryId] = {
          image,
          productId: product.id,
        }
      } catch (error) {
        console.warn("Failed to build preview for category", categoryId, error)
      }
    })
  )

  return NextResponse.json({ previews })
}

