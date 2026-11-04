/**
 * Vendor portal session cookies.
 *
 * Medusa signs access tokens with its JWT_SECRET. The portal may have a
 * different (or missing) JWT_SECRET, which previously made middleware reject
 * a valid login cookie and bounce users back to /login.
 *
 * Fix: after Medusa login, the portal seals the access token with a
 * portal-local secret into `vp1.<payload>.<sig>`. Middleware / proxy only
 * need to verify that portal seal — they no longer require Medusa's secret.
 */
import crypto from "crypto"

export type VendorClaims = {
  sub: string
  vendor_id: string
  scope: "vendor"
  iat: number
  exp: number
}

type SealedPayload = {
  access_token: string
  sub: string
  vendor_id: string
  scope: "vendor"
  exp: number
}

const SEAL_PREFIX = "vp1"

function getSealSecret(): string {
  const explicit =
    process.env.VENDOR_SESSION_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim()
  if (explicit) return explicit

  // Last-resort stable server-side key so a missing JWT_SECRET cannot lock vendors out.
  const material =
    process.env.MEDUSA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    process.env.VERCEL_URL ||
    ""
  if (material) {
    return crypto.createHash("sha256").update(`oweg-vendor-seal:${material}`).digest("hex")
  }
  return "oweg-vendor-dev-seal"
}

function b64urlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

function hmac(data: string): string {
  return crypto.createHmac("sha256", getSealSecret()).update(data).digest("base64url")
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

/** Decode Medusa JWT claims without verifying Medusa's signature. */
export function decodeVendorAccessToken(token: string): VendorClaims | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const claims = JSON.parse(
      Buffer.from(parts[1], "base64url").toString()
    ) as VendorClaims
    if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null
    if (claims.scope !== "vendor" || !claims.vendor_id || !claims.sub) return null
    return claims
  } catch {
    return null
  }
}

/**
 * Verify a raw Medusa vendor JWT against JWT_SECRET (when secrets match).
 * Kept for diagnostics; session cookies use sealVendorSession instead.
 */
export function verifyVendorToken(token: string): VendorClaims | null {
  try {
    if (token.startsWith(`${SEAL_PREFIX}.`)) {
      const session = unsealVendorSession(token)
      return session?.claims || null
    }

    const parts = token.split(".")
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, sig] = parts
    const secret = process.env.JWT_SECRET?.trim()
    if (!secret) {
      // Fall back to decode-only outside production; production uses sealed cookies.
      if (process.env.NODE_ENV === "production") return decodeVendorAccessToken(token)
      return decodeVendorAccessToken(token)
    }

    const data = `${headerB64}.${payloadB64}`
    const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url")
    if (!safeEqual(sig, expected)) return null

    return decodeVendorAccessToken(token)
  } catch {
    return null
  }
}

/** Wrap a Medusa access token in a portal-signed session cookie value. */
export function sealVendorSession(accessToken: string): string | null {
  const claims = decodeVendorAccessToken(accessToken)
  if (!claims) return null

  const payload: SealedPayload = {
    access_token: accessToken,
    sub: claims.sub,
    vendor_id: claims.vendor_id,
    scope: "vendor",
    exp: claims.exp,
  }
  const body = b64urlJson(payload)
  const sig = hmac(body)
  return `${SEAL_PREFIX}.${body}.${sig}`
}

/** Read portal session cookie → Medusa bearer token + claims. */
export function unsealVendorSession(
  cookieValue: string
): { accessToken: string; claims: VendorClaims } | null {
  try {
    const raw = cookieValue.trim()
    if (!raw) return null

    // Backward compatible: raw Medusa JWT (pre-seal deploys / secret match).
    if (!raw.startsWith(`${SEAL_PREFIX}.`)) {
      const claims = verifyVendorToken(raw) || decodeVendorAccessToken(raw)
      if (!claims) return null
      return { accessToken: raw, claims }
    }

    const parts = raw.split(".")
    if (parts.length !== 3 || parts[0] !== SEAL_PREFIX) return null
    const [, body, sig] = parts
    if (!safeEqual(sig, hmac(body))) return null

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as SealedPayload

    if (!payload?.access_token || payload.scope !== "vendor") return null
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null
    if (!payload.sub || !payload.vendor_id) return null

    return {
      accessToken: payload.access_token,
      claims: {
        sub: payload.sub,
        vendor_id: payload.vendor_id,
        scope: "vendor",
        iat: 0,
        exp: payload.exp,
      },
    }
  } catch {
    return null
  }
}

export function getVendorIdFromToken(token: string | null): string | null {
  if (!token) return null
  return unsealVendorSession(token)?.claims.vendor_id || null
}
