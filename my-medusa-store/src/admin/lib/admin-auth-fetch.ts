import { getAdminBackendUrl } from "./admin-backend"

export const MEDUSA_AUTH_TOKEN_KEY = "medusa_auth_token"

declare global {
  interface Window {
    __owegAuthFetch?: boolean
  }
}

/** JWT stored by @medusajs/js-sdk when auth.type is "jwt". */
export function getAdminAuthToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(MEDUSA_AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function getAdminAuthHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra || {})
  const token = getAdminAuthToken()
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`)
  }
  return headers
}

function shouldAttachAdminAuth(url: string): boolean {
  if (!url) return false
  if (url.includes("/admin") || url.includes("/auth/")) return true
  try {
    const backend = getAdminBackendUrl()
    if (backend && url.startsWith(backend)) return true
  } catch {
    /* ignore */
  }
  return /api\.oweg\.itshover\.com/i.test(url)
}

function resolveAdminUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  if (!(url.startsWith("/admin") || url.startsWith("/auth") || url.startsWith("/store"))) {
    return url
  }
  const backend = getAdminBackendUrl()
  if (!backend || backend === window.location.origin) return url
  return `${backend}${url}`
}

/**
 * Cross-origin admin (Vercel → api.oweg.itshover.com) cannot rely on session
 * cookies. Attach the JWT and send /admin|/auth calls to the real API host.
 */
export function installAdminAuthFetch(): void {
  if (typeof window === "undefined" || window.__owegAuthFetch) return
  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url

    const absolute = resolveAdminUrl(requestUrl)
    if (absolute !== requestUrl) {
      requestUrl = absolute
      input = absolute
    }

    if (!shouldAttachAdminAuth(requestUrl)) {
      return originalFetch(input, init)
    }

    const headers = getAdminAuthHeaders(
      init?.headers || (input instanceof Request ? input.headers : undefined)
    )
    return originalFetch(input, {
      ...init,
      headers,
      // JWT is primary; include still helps same-origin / legacy cookie paths.
      credentials: init?.credentials ?? "include",
    })
  }

  window.__owegAuthFetch = true
}

/** Authenticated fetch helper for admin extensions. */
export function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  installAdminAuthFetch()
  const url = path.startsWith("http") ? path : resolveAdminUrl(path.startsWith("/") ? path : `/${path}`)
  return fetch(url, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers: getAdminAuthHeaders(init?.headers),
  })
}
