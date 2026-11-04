import { createHmac, timingSafeEqual } from "node:crypto"

const TTL_SECONDS = 15 * 60

function secret(): string {
  const value = process.env.JWT_SECRET?.trim()
  if (!value) throw new Error("JWT_SECRET is required for vendor signup upload tokens")
  return value
}

export function issueVendorSignupUploadToken(): { token: string; expires_at: string } {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS
  const payload = `signup-upload:${exp}`
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url")
  return { token: `${exp}.${sig}`, expires_at: new Date(exp * 1000).toISOString() }
}

export function verifyVendorSignupUploadToken(token: string | null | undefined): boolean {
  if (!token || !token.includes(".")) return false
  const [expRaw, sig] = token.split(".")
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false
  const payload = `signup-upload:${exp}`
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
