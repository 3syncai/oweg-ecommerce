import { NextRequest, NextResponse } from "next/server"
import {
  appendUpstreamCookies,
  extractErrorPayload,
  medusaStoreFetch,
} from "@/lib/medusa-auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const forwardedCookie = req.headers.get("cookie") || undefined
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }
    if (!forwardedCookie) {
      return NextResponse.json({ customer: null }, { status: 200 })
    }

    const upstream = await medusaStoreFetch("/store/customers/me", {
      method: "GET",
      forwardedCookie,
      forwardedHeaders,
    })

    if (!upstream.ok) {
      if (upstream.status === 401) {
        return NextResponse.json({ customer: null }, { status: 200 })
      }
      const payload = await extractErrorPayload(upstream)
      const message =
        (typeof payload === "string" && payload) ||
        (typeof payload === "object" && (payload?.error || payload?.message)) ||
        "Unable to fetch account details."
      return NextResponse.json({ error: message }, { status: upstream.status })
    }

    const data = await upstream.json()
    const response = NextResponse.json(
      { customer: data?.customer ?? data },
      { status: 200 }
    )
    appendUpstreamCookies(response, upstream)
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch account details."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
