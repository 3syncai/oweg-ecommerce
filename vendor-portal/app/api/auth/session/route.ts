import { NextRequest, NextResponse } from "next/server"
import { getMedusaBackendUrl } from "@/lib/medusa-proxy"
import { checkRateLimit, clientIpFromRequest } from "@/lib/simple-rate-limit"
import { sealVendorSession, unsealVendorSession } from "@/lib/api/token"

export const dynamic = "force-dynamic"

const COOKIE = "vendor_token"

function cookieOptions(maxAgeSeconds: number) {
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

function clearCookie(res: NextResponse) {
  res.cookies.set(COOKIE, "", { ...cookieOptions(0), maxAge: 0 })
}

/** POST — exchange email/password for an HttpOnly portal session cookie. */
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

  const accessToken = typeof (data as { token?: string }).token === "string"
    ? (data as { token: string }).token
    : ""
  if (!accessToken) {
    return NextResponse.json({ message: "Login failed" }, { status: 502 })
  }

  const sealed = sealVendorSession(accessToken)
  if (!sealed) {
    console.error("[vendor-session] Medusa returned a token the portal could not seal")
    return NextResponse.json(
      { message: "Login succeeded upstream but session could not be created. Try again." },
      { status: 502 }
    )
  }

  const res = NextResponse.json({
    vendor_user: (data as { vendor_user?: unknown }).vendor_user || null,
    vendor: (data as { vendor?: unknown }).vendor || null,
    authenticated: true,
  })
  res.cookies.set(
    COOKIE,
    sealed,
    cookieOptions(keepSignedIn ? 60 * 60 * 24 * 7 : 60 * 60 * 12)
  )
  return res
}

/** DELETE — clear HttpOnly vendor session. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  clearCookie(res)
  return res
}

/** GET — session presence for middleware/UI (does not return the token). */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value
  const session = token ? unsealVendorSession(token) : null
  if (token && !session) {
    const res = NextResponse.json({ authenticated: false })
    clearCookie(res)
    return res
  }
  return NextResponse.json({ authenticated: Boolean(session) })
}
