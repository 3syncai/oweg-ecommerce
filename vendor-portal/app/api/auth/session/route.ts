import { NextRequest, NextResponse } from "next/server"
import { getMedusaBackendUrl } from "@/lib/medusa-proxy"
import { checkRateLimit, clientIpFromRequest } from "@/lib/simple-rate-limit"

export const dynamic = "force-dynamic"

const COOKIE = "vendor_token"

function cookieOptions(maxAgeSeconds: number) {
  // Vercel / HTTPS always; also production local builds.
  const secure =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.VERCEL) ||
    process.env.VERCEL_ENV === "production"
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  }
}

/** POST — exchange email/password for an HttpOnly vendor session cookie. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === "string" ? body.email.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""
  const keepSignedIn = body.keepSignedIn === true
  if (!email || !password) {
    return NextResponse.json(
      { message: "email and password required" },
      { status: 400 }
    )
  }

  const limited = checkRateLimit({
    key: `vendor-portal-login:${email.toLowerCase()}:${clientIpFromRequest(req)}`,
    limit: 10,
    windowMs: 60_000,
  })
  if (!limited.allowed) {
    return NextResponse.json(
      { message: "Too many login attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    )
  }

  let backend: string
  try {
    backend = getMedusaBackendUrl()
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Backend not configured" },
      { status: 503 }
    )
  }

  const publishableKey =
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    ""

  const upstream = await fetch(`${backend}/vendor/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(publishableKey ? { "x-publishable-api-key": publishableKey } : {}),
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  })

  const data = await upstream.json().catch(() => ({}))
  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status })
  }

  const token = typeof (data as any).token === "string" ? (data as any).token : ""
  if (!token) {
    return NextResponse.json({ message: "Login failed" }, { status: 502 })
  }

  const res = NextResponse.json({
    vendor_user: (data as any).vendor_user || null,
    vendor: (data as any).vendor || null,
  })
  res.cookies.set(
    COOKIE,
    token,
    cookieOptions(keepSignedIn ? 60 * 60 * 24 * 7 : 60 * 60 * 12)
  )
  return res
}

/** DELETE — clear HttpOnly vendor session. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, "", { ...cookieOptions(0), maxAge: 0 })
  return res
}

/** GET — session presence for middleware/UI (does not return the token). */
export async function GET(req: NextRequest) {
  const { verifyVendorToken } = await import("@/lib/api/token")
  const token = req.cookies.get(COOKIE)?.value
  const claims = token ? verifyVendorToken(token) : null
  if (token && !claims) {
    const res = NextResponse.json({ authenticated: false })
    res.cookies.set(COOKIE, "", { ...cookieOptions(0), maxAge: 0 })
    return res
  }
  return NextResponse.json({ authenticated: Boolean(claims) })
}
