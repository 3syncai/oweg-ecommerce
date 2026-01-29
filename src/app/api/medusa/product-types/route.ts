import { NextResponse } from "next/server"
import { fetchProductTypes } from "@/lib/medusa"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const product_types = await fetchProductTypes()
    return NextResponse.json({ product_types })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
