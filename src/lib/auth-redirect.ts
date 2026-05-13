/**
 * Helpers for the "send the user back to where they were" flow after login/signup.
 *
 * Two responsibilities:
 *   1. Build a `/login?redirect=<path>` URL from the page the user is currently on.
 *   2. Read the `?redirect=` value from the login/signup page and validate it
 *      so we never open a redirect to an external attacker URL.
 *
 * SECURITY NOTE — open-redirect prevention:
 *   - Only relative paths starting with `/` are accepted.
 *   - Paths starting with `//` or `/\` are rejected (those are protocol-relative
 *     URLs that browsers treat as external).
 *   - Auth pages themselves (`/login`, `/signup`, `/forgot`, `/reset-password`)
 *     are filtered out so we never produce a self-referential redirect loop.
 *   - Whitespace and control characters are rejected.
 */

const AUTH_PAGES = new Set([
  "/login",
  "/signup",
  "/forgot",
  "/reset-password",
])

const DEFAULT_REDIRECT = "/"

/**
 * Returns true if the given value is a safe same-origin path that we can
 * navigate to after login. Rejects external URLs, protocol-relative URLs,
 * auth pages (loop), and anything containing whitespace/control characters.
 */
export function isSafeRedirect(value: string | null | undefined): value is string {
  if (!value) return false
  if (typeof value !== "string") return false
  if (value.length > 2_048) return false
  if (!value.startsWith("/")) return false
  // Reject protocol-relative URLs ("//evil.com", "/\\evil.com")
  if (value.startsWith("//") || value.startsWith("/\\")) return false
  if (/[\s\x00-\x1f]/.test(value)) return false

  // Strip query/hash before comparing to AUTH_PAGES so /login?reset=success is
  // also blocked (otherwise we'd loop back to login).
  const pathOnly = value.split(/[?#]/)[0]
  if (AUTH_PAGES.has(pathOnly)) return false

  return true
}

/**
 * Returns the safe redirect target, falling back to "/".
 */
export function getSafeRedirect(value: string | null | undefined): string {
  return isSafeRedirect(value) ? value : DEFAULT_REDIRECT
}

/**
 * Builds the URL to send a guest to the login page from `currentPath`.
 *
 *   buildLoginUrl()                  -> "/login"
 *   buildLoginUrl("/checkout")       -> "/login?redirect=%2Fcheckout"
 *   buildLoginUrl("/login")          -> "/login"   (no self-loop)
 *   buildLoginUrl("https://x.com/")  -> "/login"   (external rejected)
 */
export function buildLoginUrl(currentPath?: string | null): string {
  if (!isSafeRedirect(currentPath)) return "/login"
  return `/login?redirect=${encodeURIComponent(currentPath)}`
}

/**
 * Same as buildLoginUrl but for /signup.
 */
export function buildSignupUrl(currentPath?: string | null): string {
  if (!isSafeRedirect(currentPath)) return "/signup"
  return `/signup?redirect=${encodeURIComponent(currentPath)}`
}

/**
 * Convenience: build the full path of the page the user is currently on,
 * including search + hash, suitable for passing into buildLoginUrl().
 *
 * Use only on the client (reads window.location).
 */
export function getCurrentPathWithQuery(): string | null {
  if (typeof window === "undefined") return null
  const { pathname, search, hash } = window.location
  return `${pathname}${search}${hash}`
}
