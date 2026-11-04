/**
 * In-process sliding window rate limiter for Medusa route handlers.
 * Best-effort across a single process; blocks credential stuffing / spam.
 */

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

export function checkRateLimit(options: {
  key: string
  limit: number
  windowMs?: number
}): { allowed: boolean; retryAfterSec: number } {
  const windowMs = options.windowMs ?? 60_000
  const now = Date.now()
  const windowStart = now - windowMs
  prune(now)

  let bucket = buckets.get(options.key)
  if (!bucket) {
    bucket = { timestamps: [] }
    buckets.set(options.key, bucket)
  }
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart)

  if (bucket.timestamps.length >= options.limit) {
    const oldest = bucket.timestamps[0] || now
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    }
  }

  bucket.timestamps.push(now)
  return { allowed: true, retryAfterSec: 0 }
}

export function clientIpFromMedusaReq(req: {
  headers?: Record<string, unknown>
  ip?: string
  socket?: { remoteAddress?: string }
}): string {
  const headers = req.headers || {}
  const forwarded = headers["x-forwarded-for"]
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim()
  }
  if (typeof headers["x-real-ip"] === "string" && headers["x-real-ip"]) {
    return headers["x-real-ip"]
  }
  return req.ip || req.socket?.remoteAddress || "unknown"
}
