import { NextRequest, NextResponse } from "next/server"
import { fetchMegaMenuBanners } from "@/lib/medusa"

export async function GET(req: NextRequest) {
  try {
    const handle = req.nextUrl.searchParams.get("handle")?.trim()
    if (!handle) {
      return NextResponse.json({ error: "handle is required" }, { status: 400 })
    }

    const banners = await fetchMegaMenuBanners(handle)
    const response = NextResponse.json({ banners, count: banners.length, handle })
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
