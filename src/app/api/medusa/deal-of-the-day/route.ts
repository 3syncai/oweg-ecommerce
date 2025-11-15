import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const currentUrl = new URL(req.url)
    const searchParams = currentUrl.searchParams
    const categoryId = searchParams.get("categoryId")
    const category = searchParams.get("category")
    const limit = searchParams.get("limit") || "20"

    if (!categoryId && !category) {
      return NextResponse.json({ products: [], total: 0 })
    }

    const proxyUrl = new URL(req.url)
    proxyUrl.pathname = "/api/medusa/products"
    const proxyParams = new URLSearchParams()
    if (categoryId) proxyParams.set("categoryId", categoryId)
    if (category) proxyParams.set("category", category)
    proxyParams.set("dealsOnly", "1")
    proxyParams.set("limit", limit)
    proxyUrl.search = proxyParams.toString()

    const response = await fetch(proxyUrl.toString(), { cache: "no-store" })
    if (!response.ok) {
      throw new Error(`Upstream error: ${response.status}`)
    }

    const data = await response.json()
    const products = Array.isArray(data.products) ? data.products : []

    return NextResponse.json({
      products,
      total: products.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "failed"
    return NextResponse.json(
      { products: [], total: 0, error: message },
      { status: 500 }
    )
  }
}

