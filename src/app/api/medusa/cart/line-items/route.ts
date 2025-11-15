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

type EnsureCartResult = {
  cartId: string
  shouldSetCookie: boolean
}

async function ensureCartId(): Promise<EnsureCartResult> {
  const c = await cookies()
  const existing = c.get(CART_COOKIE)?.value
  if (existing) {
    return { cartId: existing, shouldSetCookie: false }
  }
  const res = await backend(`/store/carts`, { method: "POST" })
  if (!res.ok) throw new Error("create cart failed")
  const json = await res.json()
  const id = json.cart?.id || json.id
  if (!id) throw new Error("cart id missing from backend")
  return { cartId: id, shouldSetCookie: true }
}

async function createFreshCart(): Promise<string> {
  const res = await backend(`/store/carts`, { method: "POST" })
  if (!res.ok) throw new Error(`create cart failed: ${res.status}`)
  const json = await res.json()
  const cartId = json.cart?.id || json.id
  if (!cartId) throw new Error("cart id missing from backend")
  return cartId
}

async function addLineItemRequest(cartId: string, body: { variant_id: string; quantity: number }) {
  return backend(`/store/carts/${encodeURIComponent(cartId)}/line-items`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

async function readErrorPayload(res: Response) {
  try {
    return await res.json()
  } catch {
    try {
      return await res.text()
    } catch {
      return null
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const variant_id: string = body.variant_id
    const quantity: number = Number(body.quantity || 1)
    if (!variant_id) return NextResponse.json({ error: "variant_id required" }, { status: 400 })
    let { cartId, shouldSetCookie } = await ensureCartId()
    let res = await addLineItemRequest(cartId, { variant_id, quantity })

    // If cart was stale (deleted upstream), create a fresh one and retry once.
    if (!res.ok && res.status === 404) {
      try {
        const freshId = await createFreshCart()
        cartId = freshId
        shouldSetCookie = true
        res = await addLineItemRequest(cartId, { variant_id, quantity })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "failed to refresh cart"
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }

    if (!res.ok) {
      const errorPayload = await readErrorPayload(res)
      const message =
        (errorPayload && (errorPayload.error || errorPayload.message)) ||
        `add failed: ${res.status}`
      return NextResponse.json({ error: message, details: errorPayload }, { status: res.status })
    }

    const data = await res.json()
    const response = NextResponse.json(data)
    if (shouldSetCookie) {
      response.cookies.set(CART_COOKIE, cartId, { httpOnly: false, sameSite: "lax", path: "/" })
    }
    return response
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
