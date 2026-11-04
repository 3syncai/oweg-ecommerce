import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

/**
 * Fail closed: CRON_SECRET must be set and Authorization: Bearer <secret> must match.
 */
export function requireCronSecret(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    )
  }

  const authHeader = req.headers.get("authorization")?.trim() || ""
  const expected = `Bearer ${cronSecret}`
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
