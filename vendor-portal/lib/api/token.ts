/**
 * JWT verification for vendor portal middleware / client helpers.
 * Must share JWT_SECRET with Medusa vendor token signing.
 */
import crypto from "crypto"

export type VendorClaims = {
  sub: string
  vendor_id: string
  scope: "vendor"
  iat: number
  exp: number
}

function getSecret(): string | null {
  const secret = process.env.JWT_SECRET?.trim()
  return secret || null
}

export function verifyVendorToken(token: string): VendorClaims | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, sig] = parts
    const secret = getSecret()
    if (!secret) {
      // Without a shared secret we can only reject obviously malformed tokens.
      // Prefer fail-closed for protected UI when secret is missing in production.
      if (process.env.NODE_ENV === "production") return null
      const claims = JSON.parse(
        Buffer.from(payloadB64, "base64url").toString()
      ) as VendorClaims
      if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null
      if (claims.scope !== "vendor" || !claims.vendor_id || !claims.sub) return null
      return claims
    }

    const data = `${headerB64}.${payloadB64}`
    const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url")
    const sigBuf = Buffer.from(sig)
    const expectedBuf = Buffer.from(expected)
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null
    }

    const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as VendorClaims
    if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null
    if (claims.scope !== "vendor" || !claims.vendor_id || !claims.sub) return null
    return claims
  } catch {
    return null
  }
}

export function getVendorIdFromToken(token: string | null): string | null {
  if (!token) return null
  const claims = verifyVendorToken(token)
  return claims?.vendor_id || null
}
