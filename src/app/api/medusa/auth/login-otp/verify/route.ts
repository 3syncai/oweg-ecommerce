import { NextRequest, NextResponse } from "next/server"
import {
  appendUpstreamCookies,
  collectSetCookies,
  cookiesToHeader,
  extractErrorPayload,
  medusaStoreFetch,
} from "@/lib/medusa-auth"

export const dynamic = "force-dynamic"

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const otpRegex = /^\d{6}$/

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; otp?: string }
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }

    const email = body.email?.trim().toLowerCase()
    const otp = body.otp?.trim()

    if (!email || !emailRegex.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
    }
    if (!otp || !otpRegex.test(otp)) {
      return NextResponse.json({ error: "Enter the 6-digit OTP." }, { status: 400 })
    }

    const verifyRes = await medusaStoreFetch("/store/customers/login-otp/verify", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
      forwardedHeaders,
    })

    if (!verifyRes.ok) {
      const payload = await extractErrorPayload(verifyRes)
      const message =
        typeof payload === "object" && payload
          ? (payload?.message as string | undefined) || (payload?.error as string | undefined)
          : null
      return NextResponse.json(
        { error: message || "Invalid or expired OTP." },
        { status: verifyRes.status }
      )
    }

    const verifyPayload = (await verifyRes.json().catch(() => null)) as {
      token?: string
      message?: string
    } | null

    if (!verifyPayload?.token) {
      return NextResponse.json(
        { error: "Unable to sign in. Please try again." },
        { status: 502 }
      )
    }

    const sessionRes = await medusaStoreFetch("/auth/session", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${verifyPayload.token}`,
      },
      forwardedHeaders,
      skipContentType: true,
    })

    if (!sessionRes.ok) {
      const payload = await extractErrorPayload(sessionRes)
      const message =
        typeof payload === "object" && payload
          ? (payload?.message as string | undefined) || (payload?.error as string | undefined)
          : null
      return NextResponse.json(
        { error: message || "Unable to start your session." },
        { status: sessionRes.status }
      )
    }

    const sessionCookies = collectSetCookies(sessionRes.headers)
    const forwardedCookie = cookiesToHeader(sessionCookies)

    if (!forwardedCookie) {
      return NextResponse.json(
        { error: "Login succeeded, but session cookie was not returned." },
        { status: 502 }
      )
    }

    const meRes = await medusaStoreFetch("/store/customers/me", {
      method: "GET",
      forwardedHeaders,
      forwardedCookie,
    })

    if (!meRes.ok) {
      const payload = await extractErrorPayload(meRes)
      const message =
        typeof payload === "object" && payload
          ? (payload?.message as string | undefined) || (payload?.error as string | undefined)
          : null
      return NextResponse.json(
        { error: message || "Unable to fetch your account." },
        { status: meRes.status }
      )
    }

    const mePayload = await meRes.json().catch(() => null)
    const response = NextResponse.json(
      {
        customer: (mePayload as { customer?: unknown } | null)?.customer ?? mePayload,
        message: verifyPayload.message || "Logged in successfully.",
      },
      { status: 200 }
    )
    appendUpstreamCookies(response, sessionRes)
    return response
  } catch {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
