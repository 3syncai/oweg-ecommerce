import { NextRequest, NextResponse } from "next/server"
import { appendUpstreamCookies, medusaStoreFetch, STORE_SESSION_COOKIE } from "@/lib/medusa-auth"

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

    if (!upstream.ok && upstream.status !== 401) {
      return NextResponse.json({ error: "Unable to sign out. Please try again." }, { status: 503 })
    }

    const response = NextResponse.json({ success: true }, { status: 200 })
    appendUpstreamCookies(response, upstream)
    response.cookies.delete(STORE_SESSION_COOKIE)
    return response
  } catch {
    return NextResponse.json({ error: "Unable to sign out. Please try again." }, { status: 503 })
  }
}
