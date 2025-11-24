// Cart Merge API: Merges guest cart with customer cart on login

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import {
  appendUpstreamCookies,
  extractErrorPayload,
  medusaStoreFetch,
} from "@/lib/medusa-auth"

export const dynamic = "force-dynamic"

const CART_COOKIE = "cart_id"
const GUEST_CART_HEADER = "x-guest-cart-id"

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

function toErrorMessage(errorPayload: unknown, fallback: string) {
  if (typeof errorPayload === "string" && errorPayload) return errorPayload
  if (typeof errorPayload === "object" && errorPayload) {
    const payload = errorPayload as Record<string, unknown>
    if (typeof payload.error === "string" && payload.error) return payload.error
    if (typeof payload.message === "string" && payload.message) return payload.message
  }
  return fallback
}

/**
 * POST /api/medusa/cart/merge
 * Merges guest cart (from localStorage) with customer cart (from session)
 */
export async function POST(req: NextRequest) {
  try {
    const forwardedCookie = req.headers.get("cookie") || undefined
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }
    
    // Get guest cart ID from header
    const guestCartId = req.headers.get(GUEST_CART_HEADER)
    
    if (!forwardedCookie) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    
    if (!guestCartId) {
      // No guest cart to merge, just return success
      return NextResponse.json({ success: true, merged: false })
    }
    
    // Get customer cart ID from cookie
    const c = await cookies()
    const customerCartId = c.get(CART_COOKIE)?.value
    
    if (!customerCartId) {
      // No customer cart exists, assign guest cart to customer
      const assignRes = await medusaStoreFetch(`/store/carts/${guestCartId}`, {
        method: "POST",
        forwardedCookie,
        forwardedHeaders,
        body: JSON.stringify({ customer_id: undefined }), // Will be set by Medusa from session
      })
      
      if (!assignRes.ok) {
        const errorPayload = await extractErrorPayload(assignRes)
        const message = toErrorMessage(errorPayload, "Failed to assign cart to customer")
        return NextResponse.json({ error: message }, { status: assignRes.status })
      }
      
      const assignData = await assignRes.json()
      const response = NextResponse.json({ success: true, merged: true, cart: assignData.cart || assignData })
      appendUpstreamCookies(response, assignRes)
      response.cookies.set(CART_COOKIE, guestCartId, { httpOnly: false, sameSite: "lax", path: "/" })
      return response
    }
    
    // Both carts exist - merge guest cart into customer cart
    // First, get line items from guest cart
    const guestCartRes = await backend(`/store/carts/${guestCartId}`)
    if (!guestCartRes.ok) {
      // Guest cart doesn't exist or is invalid, just return success
      return NextResponse.json({ success: true, merged: false })
    }
    
    const guestCartData = await guestCartRes.json()
    const guestCart = guestCartData.cart || guestCartData
    const guestLineItems = guestCart.items || []
    
    if (guestLineItems.length === 0) {
      // No items to merge
      return NextResponse.json({ success: true, merged: false })
    }
    
    // Get customer cart to check existing items
    const customerCartRes = await medusaStoreFetch(`/store/carts/${customerCartId}`, {
      method: "GET",
      forwardedCookie,
      forwardedHeaders,
    })
    
    if (!customerCartRes.ok) {
      const errorPayload = await extractErrorPayload(customerCartRes)
      const message = toErrorMessage(errorPayload, "Failed to fetch customer cart")
      return NextResponse.json({ error: message }, { status: customerCartRes.status })
    }
    
    const customerCartData = await customerCartRes.json()
    const customerCart = customerCartData.cart || customerCartData
    const existingItems = (customerCart.items || []).reduce((acc: Record<string, number>, item: { variant_id?: string; quantity?: number }) => {
      if (item.variant_id) {
        acc[item.variant_id] = (acc[item.variant_id] || 0) + (item.quantity || 0)
      }
      return acc
    }, {})
    
    // Merge line items: add guest items to customer cart
    const mergePromises = guestLineItems.map(async (item: { variant_id?: string; quantity?: number }) => {
      if (!item.variant_id) return null
      
      const existingQty = existingItems[item.variant_id] || 0
      const newQty = (item.quantity || 0) + existingQty
      
      return medusaStoreFetch(`/store/carts/${customerCartId}/line-items`, {
        method: "POST",
        forwardedCookie,
        forwardedHeaders,
        body: JSON.stringify({
          variant_id: item.variant_id,
          quantity: newQty,
        }),
      })
    })
    
    await Promise.all(mergePromises.filter(Boolean))
    
    // Get updated customer cart
    const updatedCartRes = await medusaStoreFetch(`/store/carts/${customerCartId}`, {
      method: "GET",
      forwardedCookie,
      forwardedHeaders,
    })
    
    if (!updatedCartRes.ok) {
      const errorPayload = await extractErrorPayload(updatedCartRes)
      const message = toErrorMessage(errorPayload, "Failed to fetch updated cart")
      return NextResponse.json({ error: message }, { status: updatedCartRes.status })
    }
    
    const updatedCartData = await updatedCartRes.json()
    const response = NextResponse.json({
      success: true,
      merged: true,
      cart: updatedCartData.cart || updatedCartData,
    })
    appendUpstreamCookies(response, updatedCartRes)
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to merge cart"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

