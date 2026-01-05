import { NextRequest, NextResponse } from "next/server"
import { extractErrorPayload, medusaStoreFetch } from "@/lib/medusa-auth"

export const dynamic = "force-dynamic"

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json()) as { email?: string }
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }
    const normalized = email?.trim().toLowerCase()
    if (!normalized || !emailRegex.test(normalized)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
    }

    const upstream = await medusaStoreFetch("/store/customers/password-token", {
      method: "POST",
      body: JSON.stringify({ email: normalized }),
      forwardedHeaders,
    })

    if (!upstream.ok) {
      const payload = await extractErrorPayload(upstream)
      const message =
        (typeof payload === "string" && payload) ||
        (typeof payload === "object" && (payload?.error || payload?.message)) ||
        "Unable to start password reset."
      return NextResponse.json({ error: message }, { status: upstream.status })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start password reset."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
