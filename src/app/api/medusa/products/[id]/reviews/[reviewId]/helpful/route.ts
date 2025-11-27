import { NextRequest, NextResponse } from "next/server"
import {
  appendUpstreamCookies,
  medusaStoreFetch,
} from "@/lib/medusa-auth"

export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; reviewId: string }> }
) {
  try {
    const { id, reviewId } = await context.params
    
    const forwardedCookie = req.headers.get("cookie") || undefined
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }
    
    const res = await medusaStoreFetch(`/store/products/${id}/reviews/${reviewId}/helpful`, {
      method: "POST",
      forwardedCookie,
      forwardedHeaders,
    })
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: "Failed to mark review as helpful" }))
      return NextResponse.json(error, { status: res.status })
    }
    
    const data = await res.json()
    const response = NextResponse.json(data)
    appendUpstreamCookies(response, res)
    return response
  } catch (error) {
    console.error("Error marking review as helpful:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { message: "Failed to mark review as helpful", error: errorMessage },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-publishable-api-key",
    },
  })
}

