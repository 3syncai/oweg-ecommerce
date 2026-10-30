import {
  PRODUCTION_MEDUSA_API_ORIGIN,
  isProxyAdminBackendUrl,
  resolveAdminBackendUrl,
} from "../../lib/admin-backend-url"

export function getAdminBackendUrl(): string {
  if (typeof window === "undefined") return ""
  const configured =
    process.env.BACKEND_URL || process.env.MEDUSA_ADMIN_BACKEND_URL || ""
  if (!isProxyAdminBackendUrl(configured)) {
    return String(configured).replace(/\/$/, "")
  }
  if (/\.vercel\.app$/i.test(window.location.hostname)) {
    return PRODUCTION_MEDUSA_API_ORIGIN
  }
  return resolveAdminBackendUrl(configured, {
    production: false,
    fallbackDev: window.location.origin,
  })
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
