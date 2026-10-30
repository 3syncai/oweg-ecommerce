const PRODUCTION_API_ORIGIN = "https://api.oweg.itshover.com"

export function getAdminBackendUrl(): string {
  if (typeof window === "undefined") return ""
  const configured = (
    process.env.BACKEND_URL ||
    process.env.MEDUSA_ADMIN_BACKEND_URL ||
    ""
  ).replace(/\/$/, "")
  // Prefer the real Medusa host over same-origin /api (Vercel rewrite), which
  // intermittently returns 30s 502s against the Hostinger origin.
  if (configured && configured !== "/api") return configured
  if (
    typeof window !== "undefined" &&
    /\.vercel\.app$/i.test(window.location.hostname)
  ) {
    return PRODUCTION_API_ORIGIN
  }
  return (configured || window.location.origin).replace(/\/$/, "")
}

export async function readAdminApiError(
  res: Response,
  fallback: string
): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string; error?: string }
    const detail = data.message || data.error
    if (detail) return `${fallback} (${res.status}): ${detail}`
  } catch {
    /* response body was not JSON */
  }
  return `${fallback} (${res.status})`
}
