import { NextRequest, NextResponse } from "next/server"
import {
  appendUpstreamCookies,
  extractErrorPayload,
  medusaStoreFetch,
} from "@/lib/medusa-auth"
import { fetchProductDetail } from "@/lib/medusa"

export const dynamic = "force-dynamic"

type WishlistBody = {
  productId?: string
}

function toErrorMessage(errorPayload: unknown, fallback: string) {
  if (typeof errorPayload === "string" && errorPayload) return errorPayload
  if (typeof errorPayload === "object" && errorPayload) {
    const payload = errorPayload as Record<string, unknown>
    if (typeof payload.error === "string" && payload.error) return payload.error
    if (typeof payload.message === "string" && payload.message) return payload.message
  }
  return fallback
}

function toWishlistArray(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata || typeof metadata !== "object") return []
  const raw = (metadata as Record<string, unknown>).wishlist
  if (!Array.isArray(raw)) return []
  return raw
    .map((id) => {
      if (typeof id === "string" || typeof id === "number") return id.toString()
      return null
    })
    .filter((v): v is string => Boolean(v))
}

async function fetchWishlistProducts(ids: string[]) {
  const products = []
  const uniqueIds = [...new Set(ids)]
  // Bounded fan-out protects the backend; output retains the saved order.
  for (let offset = 0; offset < uniqueIds.length; offset += 4) {
    const batch = await Promise.all(uniqueIds.slice(offset, offset + 4).map(async (id) => {
    try {
      const detail = await fetchProductDetail(id)
      if (!detail) return null
      return {
        // Keep the saved identity even when detail grouping picks another seller.
        id,
        title: detail.title,
        handle: detail.handle,
        thumbnail: detail.thumbnail || detail.images?.[0],
        images: (detail.images || []).map((url) => ({ url })),
        price: detail.price,
        mrp: detail.mrp,
        discount: detail.discount,
        variant_id: detail.variant_id,
        variant_count: detail.variants?.length || 1,
      }
    } catch {
      console.warn("wishlist: detail unavailable", id)
      return null
    }
    }))
    products.push(...batch.filter((item) => item !== null))
  }
  return products
}

export async function GET(req: NextRequest) {
  try {
    const forwardedCookie = req.headers.get("cookie") || undefined
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }
    if (!forwardedCookie) {
      return NextResponse.json({ customer: null, products: [] }, { status: 200 })
    }

    const meRes = await medusaStoreFetch("/store/customers/me", {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
      forwardedCookie,
      forwardedHeaders,
    })

    if (!meRes.ok) {
      if (meRes.status === 401) {
        return NextResponse.json({ customer: null, products: [] }, { status: 200 })
      }
      const payload = await extractErrorPayload(meRes)
      const message = toErrorMessage(payload, "Unable to fetch wishlist.")
      return NextResponse.json({ error: message }, { status: meRes.status })
    }

    const mePayload = await meRes.json()
    const customer = mePayload?.customer || mePayload
    const wishlistIds = toWishlistArray(customer?.metadata)
    const products = req.nextUrl.searchParams.get("ids") === "1" ? [] : await fetchWishlistProducts(wishlistIds)
    const response = NextResponse.json({ customer, products, wishlist: wishlistIds }, { status: 200 })
    appendUpstreamCookies(response, meRes)
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load wishlist."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function write(req: NextRequest, saved: boolean) {
  try {
    const forwardedCookie = req.headers.get("cookie") || undefined
    if (!forwardedCookie) return NextResponse.json({ error: "Please sign in to update wishlist." }, { status: 401 })
    const body = await req.json().catch(() => null) as WishlistBody | null
    const productId = typeof body?.productId === "string" ? body.productId.trim() : ""
    if (!productId || productId.length > 200) return NextResponse.json({ error: "Product id is required." }, { status: 400 })
    const upstream = await medusaStoreFetch("/store/customer-wishlist", {
      method: "POST", signal: AbortSignal.timeout(12_000), forwardedCookie,
      forwardedHeaders: {
        origin: req.headers.get("origin") ?? undefined,
        referer: req.headers.get("referer") ?? undefined,
        "user-agent": req.headers.get("user-agent") ?? undefined,
      },
      body: JSON.stringify({ productId, saved }),
    })
    const data = await upstream.json().catch(() => ({ error: "Unable to update wishlist." }))
    const response = NextResponse.json(data, { status: upstream.status, headers: { "Cache-Control": "private, no-store" } })
    appendUpstreamCookies(response, upstream)
    return response
  } catch {
    return NextResponse.json({ error: "Unable to update wishlist. Please retry." }, { status: 502 })
  }
}

// Explicit intents are idempotent; never toggle on the server or replay POST blindly.
export const POST = (req: NextRequest) => write(req, true)
export const DELETE = (req: NextRequest) => write(req, false)
