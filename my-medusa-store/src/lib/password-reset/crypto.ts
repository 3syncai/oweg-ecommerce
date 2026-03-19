import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"

import { passwordResetConfig } from "./config"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TOKEN_REGEX = /^[A-Za-z0-9_-]{32,256}$/

function getHashSecret() {
  const secret =
    process.env.PASSWORD_RESET_HASH_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    process.env.COOKIE_SECRET?.trim()

  if (!secret) {
    throw new Error("Password reset hash secret is not configured")
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

export function normalizeToken(input: unknown) {
  if (typeof input !== "string") {
    return null
  }

  const normalized = input.trim()
  if (!normalized || normalized.includes("\r") || normalized.includes("\n")) {
    return null
  }

  if (!TOKEN_REGEX.test(normalized)) {
    return null
  }

  return normalized
}

export function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function createLookupHash(scope: string, value: string) {
  return createHmac("sha256", getHashSecret())
    .update(`${scope}:${value}`, "utf8")
    .digest("hex")
}

export function createPasswordResetToken() {
  const rawToken = randomBytes(passwordResetConfig.tokenBytes).toString("base64url")

  return {
    rawToken,
    tokenHash: hashToken(rawToken),
  }
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

export function buildResetUrl(rawToken: string) {
  if (!passwordResetConfig.frontendUrl) {
    return null
  }

  return `${passwordResetConfig.frontendUrl}/reset-password?token=${encodeURIComponent(
    rawToken
  )}`
}
