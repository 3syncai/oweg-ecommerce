import crypto from "crypto"

const getSecret = () => process.env.JWT_SECRET || "supersecret"

export type VendorClaims = {
  sub: string
  vendor_id: string
  scope: "vendor"
  iat: number
  exp: number
}

export function signVendorToken(payload: Omit<VendorClaims, "iat" | "exp">, ttlSeconds = 60 * 60 * 24) {
  const header = { alg: "HS256", typ: "JWT" }
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + ttlSeconds
  const claims: VendorClaims = { ...payload, iat, exp }
  const base64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url")
  const headerB64 = base64url(header)
  const claimsB64 = base64url(claims)
  const data = `${headerB64}.${claimsB64}`
  const sig = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url")
  return `${data}.${sig}`
}

export function verifyVendorToken(token: string): VendorClaims | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const data = `${h}.${p}`
  const expected = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url")
  if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null
  const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as VendorClaims
  if (claims.exp < Math.floor(Date.now() / 1000)) return null
  if (claims.scope !== "vendor") return null
  return claims
}


