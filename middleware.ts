import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { isSafeRedirect } from "@/lib/auth-redirect"
import { getDebugControllerSettings } from "@/lib/debug-controller/settings"
import { isDebugControllerEnabled } from "@/lib/debug-controller/db"
import { clientIpFromRequest, rateLimitOrNull } from "@/lib/simple-rate-limit"

const GUARDED_AUTH_ROUTES = new Set(["/login", "/signup"])
const MAINTENANCE_BYPASS = new Set([
  "/maintenance",
  "/offline",
])

const GUARDED_DEBUG_ROUTE_PREFIXES = [
  "/api/debug/",
  "/api/debug-order-payment",
  "/api/debug-status",
  "/api/debug-schema",
  "/api/cleanup-payments",
  "/api/affiliate/debug-wallet",
]

function isDebugControllerPath(pathname: string) {
  return (
    pathname === "/debug-controller-4719" ||
    pathname.startsWith("/debug-controller-4719/") ||
    pathname.startsWith("/api/debug-controller")
  )
}

function isProductionDebugRoute(pathname: string) {
  if (isDebugControllerPath(pathname)) {
    return !isDebugControllerEnabled()
  }
  return GUARDED_DEBUG_ROUTE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  )
}

function isMaintenanceBypass(pathname: string) {
  if (MAINTENANCE_BYPASS.has(pathname)) return true
  if (isDebugControllerPath(pathname) && isDebugControllerEnabled()) return true
  if (pathname.startsWith("/api/medusa/auth")) return true
  if (pathname.startsWith("/_next")) return true
  if (pathname.startsWith("/favicon")) return true
  return false
}

export async function middleware(req: NextRequest) {
  const { pathname, origin, searchParams } = req.nextUrl

  // App-level rate limits for auth / wallet / register (best-effort per instance).
  if (req.method === "POST") {
    const ip = clientIpFromRequest(req)
    if (
      pathname === "/api/medusa/auth/login" ||
      pathname.startsWith("/api/medusa/auth/login-otp/")
    ) {
      const blocked = rateLimitOrNull(req, {
        key: `mw-auth:${pathname}:${ip}`,
        limit: 20,
        windowMs: 60_000,
        message: "Too many sign-in attempts. Try again shortly.",
      })
      if (blocked) return blocked
    }
    if (pathname === "/api/medusa/customers/register") {
      const blocked = rateLimitOrNull(req, {
        key: `mw-register:${ip}`,
        limit: 8,
        windowMs: 60_000,
        message: "Too many registration attempts. Try again shortly.",
      })
      if (blocked) return blocked
    }
    if (pathname.startsWith("/api/store/wallet/")) {
      const blocked = rateLimitOrNull(req, {
        key: `mw-wallet:${pathname}:${ip}`,
        limit: 40,
        windowMs: 60_000,
        message: "Too many wallet requests. Try again shortly.",
      })
      if (blocked) return blocked
    }
    if (pathname.includes("/orders/") && pathname.endsWith("/cancel")) {
      const blocked = rateLimitOrNull(req, {
        key: `mw-cancel:${pathname}:${ip}`,
        limit: 10,
        windowMs: 60_000,
        message: "Too many cancel attempts. Try again shortly.",
      })
      if (blocked) return blocked
    }
  }

  if (
    process.env.NODE_ENV === "production" &&
    isProductionDebugRoute(pathname)
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (!isMaintenanceBypass(pathname)) {
    try {
      const settings = await getDebugControllerSettings()
      if (settings.siteStatus === "maintenance") {
        const url = req.nextUrl.clone()
        url.pathname = "/maintenance"
        url.search = ""
        return NextResponse.redirect(url)
      }

      if (pathname === "/signup" && !settings.enableRegistration) {
        const url = req.nextUrl.clone()
        url.pathname = "/login"
        url.searchParams.set("registration", "disabled")
        return NextResponse.redirect(url)
      }

      if (
        (pathname === "/checkout" || pathname.startsWith("/checkout/")) &&
        (!settings.enableCheckout || settings.siteStatus === "read_only")
      ) {
        const url = req.nextUrl.clone()
        url.pathname = "/cart"
        url.searchParams.set("checkout", "disabled")
        return NextResponse.redirect(url)
      }
    } catch {
      // If settings cannot be loaded, allow traffic through
    }
  }

  if (!GUARDED_AUTH_ROUTES.has(pathname)) {
    return NextResponse.next()
  }

  const cookie = req.headers.get("cookie")
  if (!cookie) {
    return NextResponse.next()
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 4000)

  try {
    const sessionRes = await fetch(`${origin}/api/medusa/auth/session`, {
      method: "GET",
      headers: {
        cookie,
      },
      cache: "no-store",
      signal: controller.signal,
    })

    if (!sessionRes.ok) {
      return NextResponse.next()
    }

    const payload = (await sessionRes.json().catch(() => null)) as
      | { customer?: { id?: string } | null }
      | null
    if (payload?.customer?.id) {
      const requested = searchParams.get("redirect")
      const target = isSafeRedirect(requested) ? requested : "/"
      return NextResponse.redirect(new URL(target, req.url))
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.next()
    }
    return NextResponse.next()
  } finally {
    clearTimeout(timeoutId)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/login",
    "/signup",
    "/checkout/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
