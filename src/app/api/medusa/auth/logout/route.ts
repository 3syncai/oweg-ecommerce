import { NextRequest, NextResponse } from "next/server"
import { appendUpstreamCookies, extractErrorPayload, medusaStoreFetch } from "@/lib/medusa-auth"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const forwardedCookie = req.headers.get("cookie") || undefined
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }
    if (!forwardedCookie) {
      return NextResponse.json({ success: true }, { status: 200 })
    }
    const upstream = await medusaStoreFetch("/auth/session", {
      method: "DELETE",
      forwardedCookie,
      forwardedHeaders,
      skipContentType: true,
    })

    if (!upstream.ok && upstream.status >= 500) {
      const payload = await extractErrorPayload(upstream)
      const message =
        (typeof payload === "string" && payload) ||
        (typeof payload === "object" && (payload?.error || payload?.message)) ||
        "Unable to logout. Please try again."
      return NextResponse.json({ error: message }, { status: upstream.status })
    }

    const response = NextResponse.json({ success: true }, { status: 200 })
    appendUpstreamCookies(response, upstream)
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to logout."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
