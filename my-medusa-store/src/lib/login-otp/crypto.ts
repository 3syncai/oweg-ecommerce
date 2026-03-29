import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_REGEX = /^\d{6}$/

function getHashSecret() {
  const secret =
    process.env.LOGIN_OTP_HASH_SECRET?.trim() ||
    process.env.PASSWORD_RESET_HASH_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    process.env.COOKIE_SECRET?.trim()

  if (!secret) {
    throw new Error("Login OTP hash secret is not configured")
  }

  return secret
}

export function normalizeEmail(input: unknown) {
  if (typeof input !== "string") {
    return null
  }

  const normalized = input.trim().toLowerCase()
  if (!normalized || normalized.includes("\r") || normalized.includes("\n")) {
    return null
  }

  if (!EMAIL_REGEX.test(normalized)) {
    return null
  }

  return normalized
}

export function normalizeOtp(input: unknown) {
  if (typeof input !== "string") {
    return null
  }

  const normalized = input.trim()
  if (!normalized || normalized.includes("\r") || normalized.includes("\n")) {
    return null
  }

  if (!OTP_REGEX.test(normalized)) {
    return null
  }

  return normalized
}

export function createOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0")
}

export function hashOtp(otp: string) {
  return createHash("sha256").update(otp, "utf8").digest("hex")
}

export function createLookupHash(scope: string, value: string) {
  return createHmac("sha256", getHashSecret())
    .update(`${scope}:${value}`, "utf8")
    .digest("hex")
}

export function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, "hex")
  const right = Buffer.from(b, "hex")

  if (left.length !== right.length) {
    return false
  }

  return timingSafeEqual(left, right)
}

export function getClientIp(headers: Record<string, string | string[] | undefined>) {
  const forwardedFor = headers["x-forwarded-for"]

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() || null
  }

  const realIp = headers["x-real-ip"]
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim()
  }

  return null
}
