import { NextRequest, NextResponse } from "next/server"
import { extractErrorPayload, medusaStoreFetch } from "@/lib/medusa-auth"

export const dynamic = "force-dynamic"

type ResetBody = {
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
    const token = body.token?.trim()
    const password = body.password?.trim()

    if (!token) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired." },
        { status: 400 }
      )
    }
    if (!password || password.length < 10) {
      return NextResponse.json(
        {
          error:
            "Use at least 10 characters with uppercase, lowercase, number, and special character.",
        },
        { status: 400 }
      )
    }

    const upstream = await medusaStoreFetch("/store/customers/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
      forwardedHeaders,
    })

    if (!upstream.ok) {
      const payload = await extractErrorPayload(upstream)
      const message =
        (typeof payload === "object" &&
          payload &&
          (payload?.message || payload?.error)) ||
        "Something went wrong. Please try again."
      return NextResponse.json({ error: message }, { status: upstream.status })
    }

    const data = await upstream.json().catch(() => null)

    return NextResponse.json(
      {
        success: true,
        message:
          (data as { message?: string } | null)?.message ||
          "Password reset successfully. Please log in.",
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}
