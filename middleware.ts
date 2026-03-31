import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const GUARDED_AUTH_ROUTES = new Set(["/login", "/signup"])

export async function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl

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
      return NextResponse.redirect(new URL("/", req.url))
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
  matcher: ["/login", "/signup"],
}
