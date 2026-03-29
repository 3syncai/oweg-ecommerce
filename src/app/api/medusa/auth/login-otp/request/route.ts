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

    const upstream = await medusaStoreFetch("/store/customers/login-otp/request", {
      method: "POST",
      body: JSON.stringify({ email: normalized }),
      forwardedHeaders,
    })

    if (!upstream.ok) {
      const payload = await extractErrorPayload(upstream)
      const message =
        typeof payload === "object" && payload
          ? (payload?.message as string | undefined) || (payload?.error as string | undefined)
          : null

      if (upstream.status === 400 && message) {
        return NextResponse.json({ error: message }, { status: 400 })
      }

      return NextResponse.json(
        {
          success: true,
          message: "If an account exists, an OTP has been sent to your email.",
        },
        { status: 200 }
      )
    }

    const data = await upstream.json().catch(() => null)
    return NextResponse.json(
      {
        success: true,
        message:
          (data as { message?: string } | null)?.message ||
          "If an account exists, an OTP has been sent to your email.",
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
