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
  for (const id of ids) {
    try {
      const detail = await fetchProductDetail(id)
      if (!detail) continue
      products.push({
        id: detail.id,
        title: detail.title,
        handle: detail.handle,
        thumbnail: detail.thumbnail || detail.images?.[0],
        images: (detail.images || []).map((url) => ({ url })),
        price: detail.price,
        mrp: detail.mrp,
        discount: detail.discount,
        variant_id: detail.variant_id,
      })
    } catch (err) {
      console.warn("wishlist: failed to fetch detail", id, err)
    }
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
    const products = await fetchWishlistProducts(wishlistIds)
    const response = NextResponse.json({ customer, products, wishlist: wishlistIds }, { status: 200 })
    appendUpstreamCookies(response, meRes)
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load wishlist."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const forwardedCookie = req.headers.get("cookie") || undefined
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }
    if (!forwardedCookie) {
      return NextResponse.json({ error: "Please sign in to save items." }, { status: 401 })
    }

    const body = (await req.json()) as WishlistBody
    const productId = body?.productId?.toString().trim()
    if (!productId) {
      return NextResponse.json({ error: "Product id is required." }, { status: 400 })
    }

    const meRes = await medusaStoreFetch("/store/customers/me", {
      method: "GET",
      forwardedCookie,
      forwardedHeaders,
    })
    if (!meRes.ok) {
      const payload = await extractErrorPayload(meRes)
      const message = toErrorMessage(payload, "Unable to verify your account.")
      const status = meRes.status === 401 ? 401 : meRes.status
      return NextResponse.json({ error: message }, { status })
    }
    const mePayload = await meRes.json()
    const me = mePayload?.customer || mePayload
    const existingMetadata =
      (me?.metadata && typeof me.metadata === "object" ? (me.metadata as Record<string, unknown>) : {}) || {}
    const wishlist = Array.isArray(existingMetadata.wishlist)
      ? (existingMetadata.wishlist as unknown[]).map((id) => String(id)).filter(Boolean)
      : []
    if (!wishlist.includes(productId)) {
      wishlist.push(productId)
    }

    const updateRes = await medusaStoreFetch("/store/customers/me", {
      method: "POST",
      forwardedCookie,
      forwardedHeaders,
      body: JSON.stringify({
        metadata: {
          ...existingMetadata,
          wishlist,
        },
      }),
    })

    if (!updateRes.ok) {
      const payload = await extractErrorPayload(updateRes)
      const message = toErrorMessage(payload, "Unable to save to wishlist.")
      return NextResponse.json({ error: message }, { status: updateRes.status })
    }

    const response = NextResponse.json({ wishlist }, { status: 200 })
    appendUpstreamCookies(response, updateRes)
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to save to wishlist."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const forwardedCookie = req.headers.get("cookie") || undefined
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }
    if (!forwardedCookie) {
      return NextResponse.json({ error: "Please sign in to update wishlist." }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as WishlistBody
    const productId = body?.productId?.toString().trim()
    if (!productId) {
      return NextResponse.json({ error: "Product id is required." }, { status: 400 })
    }

    const meRes = await medusaStoreFetch("/store/customers/me", {
      method: "GET",
      forwardedCookie,
      forwardedHeaders,
    })
    if (!meRes.ok) {
      const payload = await extractErrorPayload(meRes)
      const message = toErrorMessage(payload, "Unable to verify your account.")
      const status = meRes.status === 401 ? 401 : meRes.status
      return NextResponse.json({ error: message }, { status })
    }
    const mePayload = await meRes.json()
    const me = mePayload?.customer || mePayload
    const existingMetadata =
      (me?.metadata && typeof me.metadata === "object" ? (me.metadata as Record<string, unknown>) : {}) || {}
    const wishlist = toWishlistArray(existingMetadata).filter((id) => id !== productId)

    const updateRes = await medusaStoreFetch("/store/customers/me", {
      method: "POST",
      forwardedCookie,
      forwardedHeaders,
      body: JSON.stringify({
        metadata: {
          ...existingMetadata,
          wishlist,
        },
      }),
    })

    if (!updateRes.ok) {
      const payload = await extractErrorPayload(updateRes)
      const message = toErrorMessage(payload, "Unable to update wishlist.")
      return NextResponse.json({ error: message }, { status: updateRes.status })
    }

    const response = NextResponse.json({ wishlist }, { status: 200 })
    appendUpstreamCookies(response, updateRes)
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to update wishlist."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
