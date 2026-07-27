/** Medusa store list max used by /api/medusa/products. */
export const MEDUSA_LIST_MAX_LIMIT = 60

/**
 * Request enough upstream rows that stock/price/deals filters still fill a page.
 * Capped at MEDUSA_LIST_MAX_LIMIT.
 */
export function overfetchLimit(pageLimit: number, maxLimit = MEDUSA_LIST_MAX_LIMIT): number {
  const safePage = Number.isFinite(pageLimit) && pageLimit > 0 ? Math.floor(pageLimit) : 24
  return Math.min(maxLimit, Math.max(safePage * 3, safePage))
}

export type SliceFilteredPageInput<T> = {
  filtered: T[]
  /** Rows returned from Medusa before stock/price/deals filters. */
  fetchedCount: number
  pageLimit: number
  offset: number
  fetchLimit: number
  upstreamCount: number
}

export type SliceFilteredPageResult<T> = {
  products: T[]
  count: number
  hasMore: boolean
  countIsApproximate: boolean
}

/**
 * After over-fetch + client-side filters, take one page and derive honest hasMore.
 * `count` stays the upstream total (upper bound when filters removed items).
 */
export function sliceFilteredPage<T>({
  filtered,
  fetchedCount,
  pageLimit,
  offset,
  fetchLimit,
  upstreamCount,
}: SliceFilteredPageInput<T>): SliceFilteredPageResult<T> {
  const safeLimit = Number.isFinite(pageLimit) && pageLimit > 0 ? Math.floor(pageLimit) : 24
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0
  const safeFetch =
    Number.isFinite(fetchLimit) && fetchLimit > 0 ? Math.floor(fetchLimit) : safeLimit
  const safeUpstream =
    Number.isFinite(upstreamCount) && upstreamCount > 0 ? Math.floor(upstreamCount) : 0
  const safeFetched =
    Number.isFinite(fetchedCount) && fetchedCount > 0 ? Math.floor(fetchedCount) : 0

  const products = filtered.slice(0, safeLimit)
  const hasMore =
    filtered.length > safeLimit || safeOffset + safeFetch < safeUpstream

  return {
    products,
    count: safeUpstream,
    hasMore,
    countIsApproximate: filtered.length < safeFetched,
  }
}
