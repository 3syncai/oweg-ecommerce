import { NextRequest, NextResponse } from "next/server"
import { fetchProductDetail } from "@/lib/medusa"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const decoded = decodeURIComponent(id || "")
    const product = await fetchProductDetail(decoded)
    if (!product) {
      return NextResponse.json({ product: null }, { status: 404 })
    }
    return NextResponse.json({ product })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
