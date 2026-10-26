import crypto from "crypto"
import { getSharedDbPool } from "../../../lib/db-pool"

function getSecret(): string {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret) {
    throw new Error(
      "JWT_SECRET is required — refusing to sign/verify vendor tokens with a default secret"
    )
  }
  return secret
}

export type VendorClaims = {
  sub: string
  vendor_id: string
  scope: "vendor"
  jti?: string
  iat: number
  exp: number
}

export function signVendorToken(payload: Omit<VendorClaims, "iat" | "exp">, ttlSeconds = 60 * 60 * 24) {
  const header = { alg: "HS256", typ: "JWT" }
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + ttlSeconds
  const claims: VendorClaims = { ...payload, jti: crypto.randomUUID(), iat, exp }
  const base64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url")
  const headerB64 = base64url(header)
  const claimsB64 = base64url(claims)
  const data = `${headerB64}.${claimsB64}`
  const sig = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url")
  return `${data}.${sig}`
}

function verifySignature(token: string): VendorClaims | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const [h, p, s] = parts
    const data = `${h}.${p}`
    const expected = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url")
    const sigBuf = Buffer.from(s)
    const expectedBuf = Buffer.from(expected)
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null
    }
    const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as VendorClaims
    if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null
    if (!claims.sub || !claims.vendor_id) return null
    if (claims.scope !== "vendor") return null
    return claims
  } catch {
    return null
  }
}

// Persist hashes rather than bearer credentials. All API instances share revocations.
let schemaReady: Promise<void> | undefined
async function revocations() {
  const pool = getSharedDbPool()
  if (!schemaReady) {
    schemaReady = pool.query(`CREATE TABLE IF NOT EXISTS oweg_vendor_token_revocation (
      token_hash TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL
    )`).then(() => {}).catch((error) => { schemaReady = undefined; throw error })
  }
  await schemaReady
  return pool
}
const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex")

export async function verifyVendorToken(token: string): Promise<VendorClaims | null> {
  const claims = verifySignature(token)
  if (!claims) return null
  // Database failures propagate: never accept a token without checking revocation.
  const pool = await revocations()
  const result = await pool.query(
    "SELECT 1 FROM oweg_vendor_token_revocation WHERE token_hash = $1 AND expires_at > NOW()",
    [tokenHash(token)]
  )
  return result.rows.length ? null : claims
}

export async function revokeVendorToken(token: string): Promise<boolean> {
  const claims = verifySignature(token)
  if (!claims) return false
  const pool = await revocations()
  await pool.query(
    `INSERT INTO oweg_vendor_token_revocation (token_hash, expires_at) VALUES ($1, $2)
     ON CONFLICT (token_hash) DO NOTHING`,
    [tokenHash(token), new Date(claims.exp * 1000)]
  )
  await pool.query("DELETE FROM oweg_vendor_token_revocation WHERE expires_at <= NOW()")
  return true
}
