import { NextRequest, NextResponse } from "next/server"
import { extractErrorPayload, medusaStoreFetch } from "@/lib/medusa-auth"

export const dynamic = "force-dynamic"

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type ResetBody = {
  email?: string
  token?: string
  password?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ResetBody
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }
    const email = body.email?.trim().toLowerCase()
    const token = body.token?.trim()
    const password = body.password?.trim()

    if (!email || !emailRegex.test(email)) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 })
    }
    if (!token) {
      return NextResponse.json({ error: "Reset token is required." }, { status: 400 })
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long." },
        { status: 400 }
      )
    }

    const upstream = await medusaStoreFetch("/store/customers/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, token, password }),
      forwardedHeaders,
    })

    if (!upstream.ok) {
      const payload = await extractErrorPayload(upstream)
      const message =
        (typeof payload === "string" && payload) ||
        (typeof payload === "object" && (payload?.error || payload?.message)) ||
        "Unable to reset password."
      return NextResponse.json({ error: message }, { status: upstream.status })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reset password."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
