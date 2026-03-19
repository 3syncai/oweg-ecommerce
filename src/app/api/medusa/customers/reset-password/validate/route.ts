import { NextRequest, NextResponse } from "next/server"

import { extractErrorPayload, medusaStoreFetch } from "@/lib/medusa-auth"

export const dynamic = "force-dynamic"

type ValidateBody = {
  token?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ValidateBody
    const token = body.token?.trim()

    if (!token) {
      return NextResponse.json(
        { valid: false, error: "This reset link is invalid or has expired." },
        { status: 400 }
      )
    }

    const upstream = await medusaStoreFetch("/store/customers/reset-password/validate", {
      method: "POST",
      body: JSON.stringify({ token }),
      forwardedHeaders: {
        origin: req.headers.get("origin") ?? undefined,
        referer: req.headers.get("referer") ?? undefined,
        "user-agent": req.headers.get("user-agent") ?? undefined,
      },
    })

    if (!upstream.ok) {
      const payload = await extractErrorPayload(upstream)
      const message =
        (typeof payload === "object" &&
          payload &&
          (payload?.message || payload?.error)) ||
        "This reset link is invalid or has expired."

      return NextResponse.json({ valid: false, error: message }, { status: upstream.status })
    }

    return NextResponse.json({ valid: true }, { status: 200 })
  } catch {
    return NextResponse.json(
      { valid: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}
