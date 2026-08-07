import type { MedusaRequest } from "@medusajs/framework/http"

export type PaginationParams = {
  limit: number
  offset: number
  /** When true, caller should return the full list (dashboard / legacy). */
  all: boolean
}

/**
 * Parse limit/offset from vendor list endpoints.
 * - omit both → all=true (backward compatible for dashboard)
 * - limit=0 or all=1 → all=true
 * - otherwise clamp limit 1..100, offset >= 0
 */
export function parseVendorPagination(
  req: MedusaRequest,
  defaultLimit = 20
): PaginationParams {
  const q = req.query || {}
  const allFlag =
    String(q.all || "").toLowerCase() === "1" ||
    String(q.all || "").toLowerCase() === "true"

  const rawLimit = q.limit
  const rawOffset = q.offset

  if (allFlag) {
    return { limit: 0, offset: 0, all: true }
  }

  // No pagination params → preserve legacy "return everything" for dashboard/claims
  if (rawLimit === undefined && rawOffset === undefined) {
    return { limit: 0, offset: 0, all: true }
  }

  const limitNum = Number(rawLimit)
  if (!Number.isFinite(limitNum) || limitNum <= 0) {
    return { limit: 0, offset: 0, all: true }
  }

  const offsetNum = Number(rawOffset)
  return {
    limit: Math.min(100, Math.max(1, Math.floor(limitNum) || defaultLimit)),
    offset: Number.isFinite(offsetNum) && offsetNum > 0 ? Math.floor(offsetNum) : 0,
    all: false,
  }
}

export function slicePage<T>(items: T[], pagination: PaginationParams): T[] {
  if (pagination.all) return items
  return items.slice(pagination.offset, pagination.offset + pagination.limit)
}

export function paginationMeta(total: number, pagination: PaginationParams) {
  if (pagination.all) {
    return { count: total, limit: total, offset: 0 }
  }
  return {
    count: total,
    limit: pagination.limit,
    offset: pagination.offset,
  }
}
