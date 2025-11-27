import { NextRequest, NextResponse } from "next/server"
import {
  appendUpstreamCookies,
  medusaStoreFetch,
} from "@/lib/medusa-auth"

const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_API_KEY
const SALES_CHANNEL_ID = process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || process.env.MEDUSA_SALES_CHANNEL_ID

async function backend(path: string, init?: RequestInit, req?: NextRequest) {
  // Forward cookies for authentication
  const forwardedCookie = req?.headers.get("cookie") || undefined
  const forwardedHeaders = {
    origin: req?.headers.get("origin") ?? undefined,
    referer: req?.headers.get("referer") ?? undefined,
    "user-agent": req?.headers.get("user-agent") ?? undefined,
  }
  
  if (req && forwardedCookie) {
    // Use medusaStoreFetch for authenticated requests
    return medusaStoreFetch(path, {
      method: init?.method || "GET",
      forwardedCookie,
      forwardedHeaders,
      body: init?.body,
      headers: init?.headers as HeadersInit,
      skipContentType: init?.body instanceof FormData,
    })
  }
  
  // Fallback for unauthenticated requests
  const base = MEDUSA_BACKEND_URL.replace(/\/$/, "")
  const headers: Record<string, string> = {}
  
  if (PUBLISHABLE_KEY) {
    headers["x-publishable-api-key"] = PUBLISHABLE_KEY
  }
  if (SALES_CHANNEL_ID) {
    headers["x-sales-channel-id"] = SALES_CHANNEL_ID
  }
  
  // Preserve content-type from init if it exists, otherwise set default
  if (init?.headers) {
    const initHeaders = init.headers as Record<string, string>
    if (initHeaders["content-type"]) {
      headers["content-type"] = initHeaders["content-type"]
    } else if (!initHeaders["Content-Type"] && !(init?.body instanceof FormData)) {
      headers["content-type"] = "application/json"
    }
  } else if (!(init?.body instanceof FormData)) {
    headers["content-type"] = "application/json"
  }
  
  return fetch(`${base}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...headers,
      ...(init?.headers as HeadersInit),
    },
  })
}

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const res = await backend(`/store/products/${id}/reviews`, undefined, req)
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: "Failed to fetch reviews" }))
      return NextResponse.json(error, { status: res.status })
    }
    
    const data = await res.json()
    const response = NextResponse.json(data)
    appendUpstreamCookies(response, res)
    return response
  } catch (error) {
    console.error("Error fetching reviews:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { message: "Failed to fetch reviews", error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    
    // Check if user is authenticated
    const forwardedCookie = req.headers.get("cookie") || undefined
    if (!forwardedCookie) {
      return NextResponse.json(
        { message: "Authentication required. Please sign in to submit a review." },
        { status: 401 }
      )
    }
    
    // Verify customer session
    const sessionRes = await medusaStoreFetch("/store/customers/me", {
      method: "GET",
      forwardedCookie,
      forwardedHeaders: {
        origin: req.headers.get("origin") ?? undefined,
        referer: req.headers.get("referer") ?? undefined,
        "user-agent": req.headers.get("user-agent") ?? undefined,
      },
    })
    
    if (!sessionRes.ok || sessionRes.status === 401) {
      return NextResponse.json(
        { message: "Authentication required. Please sign in to submit a review." },
        { status: 401 }
      )
    }
    
    const customerData = await sessionRes.json()
    const customer = customerData?.customer || customerData
    
    if (!customer || !customer.id) {
      return NextResponse.json(
        { message: "Authentication required. Please sign in to submit a review." },
        { status: 401 }
      )
    }
    
    const body = await req.json()
    
    // Add customer info to review
    const reviewBody = {
      ...body,
      reviewer_name: customer.first_name && customer.last_name
        ? `${customer.first_name} ${customer.last_name}`
        : customer.first_name || customer.email || 'Customer',
      reviewer_email: customer.email || null,
    }
    
    const res = await backend(`/store/products/${id}/reviews`, {
      method: "POST",
      body: JSON.stringify(reviewBody),
    }, req)
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: "Failed to submit review" }))
      return NextResponse.json(error, { status: res.status })
    }
    
    const data = await res.json()
    const response = NextResponse.json(data)
    appendUpstreamCookies(response, res)
    return response
  } catch (error) {
    console.error("Error submitting review:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { message: "Failed to submit review", error: errorMessage },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-publishable-api-key",
    },
  })
}

