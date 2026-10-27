import { NextRequest, NextResponse } from "next/server"
import { getHomeDiscoveryPage } from "@/lib/home-discovery"

export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("offset") || "0"
  if (!/^\d{1,7}$/.test(raw) || Number(raw) > 1_000_000) {
    return NextResponse.json({ error: "Invalid product offset" }, { status: 400 })
  }
  try {
    return NextResponse.json(await getHomeDiscoveryPage(Number(raw)), {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=60" },
    })
  } catch {
    return NextResponse.json({ error: "Unable to load more products. Please try again." }, { status: 503 })
  }
}
