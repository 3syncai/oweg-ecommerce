import { NextResponse } from "next/server"
import { fetchMobileShopMenu } from "@/lib/medusa"

export async function GET() {
  try {
    const items = await fetchMobileShopMenu()
    return NextResponse.json({ items }, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" },
    })
  } catch {
    return NextResponse.json({ message: "Shopping menu temporarily unavailable" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    })
  }
}
