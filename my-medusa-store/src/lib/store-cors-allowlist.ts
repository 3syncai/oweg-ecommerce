/**
 * Reflect Origin only when it is an allowlisted first-party storefront/affiliate origin.
 */
const STORE_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)?oweg\.in$/i,
  /^https:\/\/oweg-ecommerce([a-z0-9-]*\.vercel\.app)$/i,
  /^https:\/\/oweg-affiliate([a-z0-9-]*\.vercel\.app)$/i,
  /^http:\/\/localhost:\d+$/i,
  /^http:\/\/127\.0\.0\.1:\d+$/i,
]

function extraOrigins(): Set<string> {
  const set = new Set<string>()
  for (const raw of [
    process.env.STORE_CORS,
    process.env.STOREFRONT_URL,
    process.env.NEXT_PUBLIC_STOREFRONT_URL,
    process.env.AFFILIATE_APP_URL,
  ]) {
    if (!raw) continue
    for (const part of raw.split(",")) {
      const value = part.trim().replace(/\/$/, "")
      if (value) set.add(value)
    }
  }
  return set
}

export function isAllowedStoreOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false
  if (extraOrigins().has(origin.replace(/\/$/, ""))) return true
  return STORE_ORIGIN_PATTERNS.some((p) => p.test(origin))
}

export function setAllowlistedCors(
  res: { setHeader: (k: string, v: string) => void },
  req: { headers?: { origin?: string } } | null | undefined,
  options?: { allowHeaders?: string }
) {
  const origin = req?.headers?.origin
  if (origin && isAllowedStoreOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
  }
  // Never reflect arbitrary Origin; missing/unknown origins get no ACAO.
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    options?.allowHeaders ||
      "Content-Type, Authorization, x-publishable-api-key, x-vendor-signup-token"
  )
}
