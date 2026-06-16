import { NextResponse } from "next/server"
import { fetchFeaturedBrands } from "@/lib/medusa"

export async function GET() {
  try {
    const collections = await fetchFeaturedBrands()
    const response = NextResponse.json({ collections })
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300"
    )
    return response
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
