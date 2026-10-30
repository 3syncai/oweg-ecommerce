/** Production Medusa API origin. Admin must call this directly — not via Vercel /api rewrites. */
export const PRODUCTION_MEDUSA_API_ORIGIN = "https://api.oweg.itshover.com"

/**
 * Reject same-origin / Vercel proxy backends. Those rewrite through Vercel to
 * Hostinger and intermittently return ~30s 502 ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR.
 */
export function isProxyAdminBackendUrl(url: string | undefined | null): boolean {
  const value = String(url || "").trim().replace(/\/$/, "")
  if (!value || value === "/api") return true
  try {
    const parsed = new URL(value, "http://localhost")
    const path = parsed.pathname.replace(/\/$/, "") || "/"
    if (path === "/api" && /\.vercel\.app$/i.test(parsed.hostname)) return true
    if (path === "/api" && parsed.hostname === "localhost") return false
  } catch {
    return value === "/api" || /\/api$/i.test(value)
  }
  return false
}

export function resolveAdminBackendUrl(
  configured: string | undefined | null,
  options?: { production?: boolean; fallbackDev?: string }
): string {
  const production = options?.production ?? process.env.NODE_ENV === "production"
  const fallbackDev = options?.fallbackDev ?? "http://localhost:9000"
  if (!isProxyAdminBackendUrl(configured)) {
    return String(configured).trim().replace(/\/$/, "")
  }
  return production ? PRODUCTION_MEDUSA_API_ORIGIN : fallbackDev
}
