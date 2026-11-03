type Bucket = { timestamps: number[] }

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 10_000

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

export function clientIpFromRequest(req: { headers: { get: (name: string) => string | null } }): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown"
}
