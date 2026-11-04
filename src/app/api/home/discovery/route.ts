import { NextRequest, NextResponse } from "next/server"
import { getHomeDiscoveryPage } from "@/lib/home-discovery"

export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("offset") || "0"
  if (!/^\d{1,7}$/.test(raw) || Number(raw) > 1_000_000) {
    return NextResponse.json({ error: "Invalid product offset" }, { status: 400 })
  }
  try {
    const { page, expiresAt } = await getHomeDiscoveryPage(Number(raw))
    const remaining = expiresAt - Date.now()
    if (remaining <= 0) throw new Error("Discovery page expired")
    const sharedSeconds = Math.min(30, Math.floor(remaining / 1000))
    return NextResponse.json(page, {
      headers: { "Cache-Control": `public, max-age=0, s-maxage=${sharedSeconds}, must-revalidate` },
    })
  } catch {
    return NextResponse.json({ error: "Unable to load more products. Please try again." }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "3" },
    })
  }
}
