/**
 * Client-side vendor session helpers.
 * Auth lives in the HttpOnly `vendor_token` cookie — never require localStorage JWT.
 */

export async function ensureVendorSession(): Promise<boolean> {
  if (typeof window === "undefined") return false
  try {
    const res = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
    if (!res.ok) return false
    const data = (await res.json().catch(() => null)) as { authenticated?: boolean } | null
    return Boolean(data?.authenticated)
  } catch {
    return false
  }
}

/** Redirect to login when the HttpOnly session is missing. Returns true when session is valid. */
export async function requireVendorSession(
  redirectToLogin: (path: string) => void,
  redirectPath?: string
): Promise<boolean> {
  const ok = await ensureVendorSession()
  if (ok) return true
  const target =
    redirectPath ||
    (typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/dashboard")
  const q = new URLSearchParams({ redirect: target.startsWith("/") ? target : "/dashboard" })
  redirectToLogin(`/login?${q}`)
  return false
}
