import { NextResponse } from "next/server"
import { fetchCategories } from "@/lib/medusa"

export async function GET() {
  try {
    const categories = await fetchCategories()
    return NextResponse.json({ categories })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
