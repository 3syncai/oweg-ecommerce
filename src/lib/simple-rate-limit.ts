/**
 * In-process sliding window rate limiter for Next.js route handlers.
 * Best-effort (not shared across instances); still blocks trivial abuse.
 */

import { NextResponse } from "next/server"

type Bucket = { timestamps: number[] }

const buckets = new Map<string, Bucket>()

const MAX_KEYS = 20_000

function prune(now: number) {
  if (buckets.size < MAX_KEYS) return
  for (const [key, bucket] of buckets) {
    if (!bucket.timestamps.length || now - bucket.timestamps[bucket.timestamps.length - 1] > 60_000) {
      buckets.delete(key)
    }
    if (buckets.size < MAX_KEYS * 0.75) break
  }
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

export function checkRateLimit(options: {
  key: string
  limit: number
  windowMs: number
}): RateLimitResult {
  const now = Date.now()
  const windowStart = now - options.windowMs
  prune(now)

  let bucket = buckets.get(options.key)
  if (!bucket) {
    bucket = { timestamps: [] }
    buckets.set(options.key, bucket)
  }

  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart)

  if (bucket.timestamps.length >= options.limit) {
    const oldest = bucket.timestamps[0] || now
    const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000))
    return { allowed: false, remaining: 0, retryAfterSec }
  }

  bucket.timestamps.push(now)
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - bucket.timestamps.length),
    retryAfterSec: 0,
  }
}

export function clientIpFromRequest(req: { headers: { get: (name: string) => string | null } }): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown"
}

/** Convenience: 429 JSON when over limit, else null. */
export function rateLimitOrNull(
  req: { headers: { get: (name: string) => string | null } },
  options: { key: string; limit: number; windowMs?: number; message?: string }
): NextResponse | null {
  const result = checkRateLimit({
    key: options.key,
    limit: options.limit,
    windowMs: options.windowMs ?? 60_000,
  })
  if (result.allowed) return null
  return NextResponse.json(
    { error: options.message || "Too many requests. Try again shortly." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSec) },
    }
  )
}
