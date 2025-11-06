import { NextResponse } from "next/server"
import { fetchCollections } from "@/lib/medusa"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const collections = await fetchCollections()
    return NextResponse.json({ collections })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
