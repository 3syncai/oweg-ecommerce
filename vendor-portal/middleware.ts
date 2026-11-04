import { safeVendorRedirect } from "./lib/vendor-redirect";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDebugControllerSettings } from "./lib/debug-controller/settings";
import { verifyVendorToken } from "./lib/api/token";

const MAINTENANCE_BYPASS = new Set([
  "/maintenance",
  "/debug-controller-4719",
]);

type MiddlewareSettings = {
  siteStatus?: "live" | "maintenance" | "read_only";
  enableRegistration?: boolean;
};

function isMaintenanceBypass(pathname: string) {
  if (MAINTENANCE_BYPASS.has(pathname)) return true;
  if (pathname.startsWith("/api/debug-controller")) return true
  if (pathname.startsWith("/api/site-settings")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  return false;
}

async function fetchDebugSettings(): Promise<MiddlewareSettings | null> {
  try {
    // Read the same cached settings directly, avoiding a second function invocation.
    return await getDebugControllerSettings();
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isMaintenanceBypass(pathname)) {
    const settings = await fetchDebugSettings();

    if (settings?.siteStatus === "maintenance") {
      const url = request.nextUrl.clone();
      url.pathname = "/maintenance";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (pathname === "/signup" && settings?.enableRegistration === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("registration", "disabled");
      return NextResponse.redirect(url);
    }
  }

  const rawToken = request.cookies.get("vendor_token")?.value || "";
  if (rawToken && process.env.NODE_ENV === "production" && !process.env.JWT_SECRET?.trim()) {
    console.error("[vendor-middleware] JWT_SECRET is missing — cannot verify vendor_token cookie");
  }
  const claims = rawToken ? verifyVendorToken(rawToken) : null;
  const authenticated = Boolean(claims);

  const protectedPaths = [
    "/dashboard",
    "/inventory",
    "/products",
    "/orders",
    "/returns",
    "/profile",
    "/customers",
    "/payout",
    "/claims",
    "/reports",
    "/messages",
    "/settings",
    "/search",
  ];
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path));

  const authPaths = ["/login", "/signup"];
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));

  if (isProtectedPath && !authenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    const res = NextResponse.redirect(loginUrl);
    if (rawToken && !claims) {
      // Drop garbage / expired cookie so UI cannot look "logged in".
      res.cookies.set("vendor_token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
    return res;
  }

  if (isAuthPath && authenticated) {
    return NextResponse.redirect(new URL(safeVendorRedirect(request.nextUrl.searchParams.get("redirect")), request.url));
  }

  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: [
    "/((?!api/medusa|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
