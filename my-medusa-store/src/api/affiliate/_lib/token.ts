import crypto from "crypto"

const getSecret = () => process.env.JWT_SECRET || "supersecret"

export type AffiliateClaims = {
  sub: string
  role: "admin" | "user"
  scope: "affiliate"
  iat: number
  exp: number
}

export function signAffiliateToken(payload: Omit<AffiliateClaims, "iat" | "exp">, ttlSeconds = 60 * 60 * 24) {
  const header = { alg: "HS256", typ: "JWT" }
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + ttlSeconds
  const claims: AffiliateClaims = { ...payload, iat, exp }
  const base64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url")
  const headerB64 = base64url(header)
  const claimsB64 = base64url(claims)
  const data = `${headerB64}.${claimsB64}`
  const sig = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url")
  return `${data}.${sig}`
}

export function verifyAffiliateToken(token: string): AffiliateClaims | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const [h, p, s] = parts
    const data = `${h}.${p}`
    const expected = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url")
    
    const sigBuf = Buffer.from(s)
    const expectedBuf = Buffer.from(expected)
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null

    const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as AffiliateClaims
    if (claims.exp < Math.floor(Date.now() / 1000)) return null
    if (claims.scope !== "affiliate") return null
    return claims
  } catch {
    return null
  }
}

