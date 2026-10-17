import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const variantId = request.nextUrl.searchParams.get("variant_id")
  if (!variantId) return NextResponse.json({ error: "variant_id required" }, { status: 400 })
  const base = (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  try {
    const response = await fetch(`${base}/store/catalog-offers?variant_id=${encodeURIComponent(variantId)}`, {
      cache: "no-store",
      headers: {
        ...(process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY
          ? { "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY || "" }
          : {}),
      },
    })
    return NextResponse.json(await response.json(), { status: response.status })
  } catch {
    return NextResponse.json({ error: "Seller offers unavailable" }, { status: 503 })
  }
}
