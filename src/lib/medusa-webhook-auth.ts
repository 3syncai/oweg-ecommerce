import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function verifyMedusaWebhookSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.MEDUSA_WEBHOOK_SECRET?.trim()
  const provided = req.headers.get("x-webhook-secret")?.trim() || ""

  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 503 }
      )
    }
    if (!secretsEqual(provided, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return null
  }

  if (secret && !secretsEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
