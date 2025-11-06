import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const CART_COOKIE = "cart_id"

async function backend(path: string, init?: RequestInit) {
  const base = (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }
  const pk = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_API_KEY
  const sc = process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || process.env.MEDUSA_SALES_CHANNEL_ID
  if (pk) headers["x-publishable-api-key"] = pk
  if (sc) headers["x-sales-channel-id"] = sc
  return fetch(`${base}${path}`, { cache: "no-store", ...init, headers: { ...headers, ...(init?.headers as HeadersInit) } })
}

export const dynamic = "force-dynamic"

async function ensureCartId() {
  const c = await cookies()
  let id = c.get(CART_COOKIE)?.value
  if (!id) {
    const res = await backend(`/store/carts`, { method: "POST" })
    if (!res.ok) throw new Error("create cart failed")
    const json = await res.json()
    id = json.cart?.id || json.id
    // cookie is set via /api/medusa/cart; this endpoint assumes cart was ensured by client first
  }
  return id!
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const variant_id: string = body.variant_id
    const quantity: number = Number(body.quantity || 1)
    if (!variant_id) return NextResponse.json({ error: "variant_id required" }, { status: 400 })
    const cartId = await ensureCartId()
    const res = await backend(`/store/carts/${cartId}/line-items`, {
      method: "POST",
      body: JSON.stringify({ variant_id, quantity }),
    })
    if (!res.ok) return NextResponse.json({ error: `add failed: ${res.status}` }, { status: 500 })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
