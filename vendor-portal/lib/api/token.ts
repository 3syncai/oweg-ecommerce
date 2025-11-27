/**
 * JWT Token utilities for vendor authentication
 * Adapted from my-medusa-store
 */

export type VendorClaims = {
  sub: string
  vendor_id: string
  scope: "vendor"
  iat: number
  exp: number
}

export function verifyVendorToken(token: string): VendorClaims | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    
    const [, payload] = parts
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as VendorClaims
    
    // Check expiration
    if (claims.exp < Math.floor(Date.now() / 1000)) return null
    if (claims.scope !== "vendor") return null
    
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

