import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

async function fetchDebugSettings(origin: string): Promise<MiddlewareSettings | null> {
  try {
    const res = await fetch(`${origin}/api/site-settings`, {
      cache: "no-store",
      headers: { "x-debug-middleware": "1" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { settings?: MiddlewareSettings };
    return data.settings || null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isMaintenanceBypass(pathname)) {
    const settings = await fetchDebugSettings(request.nextUrl.origin);

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

  const token = request.cookies.get("vendor_token")?.value;

  const protectedPaths = [
    "/dashboard",
    "/inventory",
    "/products",
    "/orders",
    "/returns",
    "/profile",
    "/customers",
    "/payout",
    "/settings",
    "/search",
  ];
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path));

  const authPaths = ["/login", "/signup"];
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));

  if (isProtectedPath && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPath && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/medusa|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
