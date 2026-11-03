/**
 * Storefront DB access boundary.
 *
 * Prefer STOREFRONT_DATABASE_URL — a least-privilege role (wallet/affiliate/
 * checkout tables only). Fall back to DATABASE_URL for local/dev.
 *
 * In production, set REQUIRE_SCOPED_STOREFRONT_DB=true to refuse the full
 * commerce DATABASE_URL on the Next.js app (forces the scoped role).
 */

import { Pool } from "pg"

function isProduction(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  )
}

export function getStorefrontDatabaseUrl(): string {
  const scoped = process.env.STOREFRONT_DATABASE_URL?.trim() || ""
  const full = process.env.DATABASE_URL?.trim() || ""

  if (isProduction() && process.env.REQUIRE_SCOPED_STOREFRONT_DB === "true") {
    if (!scoped) {
      throw new Error(
        "STOREFRONT_DATABASE_URL is required when REQUIRE_SCOPED_STOREFRONT_DB=true (do not use full DATABASE_URL on the storefront)."
      )
    }
    return scoped
  }

  const url = scoped || full
  if (!url) {
    throw new Error("STOREFRONT_DATABASE_URL or DATABASE_URL is not configured")
  }

  if (
    isProduction() &&
    !scoped &&
    full &&
    process.env.STOREFRONT_DB_WARN !== "0"
  ) {
    console.warn(
      "[storefront-db] Using full DATABASE_URL on Next.js. Prefer STOREFRONT_DATABASE_URL with a least-privilege role."
    )
  }

  return url
}

export function tryGetStorefrontDatabaseUrl(): string | null {
  try {
    return getStorefrontDatabaseUrl()
  } catch {
    return null
  }
}

const pools = new Map<string, Pool>()

/** Shared Pool keyed by connection string (bounded reuse across modules). */
export function getStorefrontPool(options?: { sslForRds?: boolean }): Pool {
  const url = getStorefrontDatabaseUrl()
  const existing = pools.get(url)
  if (existing) return existing

  const ssl =
    options?.sslForRds !== false && url.includes("amazonaws.com")
      ? { rejectUnauthorized: false }
      : undefined

  const pool = new Pool({ connectionString: url, ssl })
  pools.set(url, pool)
  return pool
}

/** Admin API key — server-only; never NEXT_PUBLIC. */
export function getMedusaAdminApiKey(): string {
  const key =
    process.env.MEDUSA_ADMIN_API_KEY?.trim() ||
    process.env.MEDUSA_ADMIN_TOKEN?.trim() ||
    ""
  if (!key) {
    throw new Error("MEDUSA_ADMIN_API_KEY is not configured")
  }
  if (key.startsWith("pk_") || process.env.NEXT_PUBLIC_MEDUSA_ADMIN_API_KEY) {
    throw new Error(
      "Medusa admin key must not be exposed via NEXT_PUBLIC_ or publishable-key shape"
    )
  }
  return key
}
