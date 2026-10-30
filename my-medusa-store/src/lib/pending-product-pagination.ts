export const PENDING_PRODUCT_PAGE_SIZE = 25
export const PENDING_PRODUCT_PAGE_MAX = 100

export function pendingProductPagination(input: Record<string, unknown>) {
  const integer = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback
    if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error("Use integer limit and offset values")
    const number = Number(value)
    if (!Number.isSafeInteger(number)) throw new Error("Invalid pagination value")
    return number
  }
  const limit = integer(input.limit, PENDING_PRODUCT_PAGE_SIZE)
  const offset = integer(input.offset, 0)
  if (limit < 1 || limit > PENDING_PRODUCT_PAGE_MAX) throw new Error("Limit must be between 1 and 100")
  return { limit, offset }
}

/** Clamp to the last available page when reviews remove the last row. */
export function pendingProductOffset(count: number, limit: number, offset: number) {
  return Math.min(offset, Math.floor(Math.max(count - 1, 0) / limit) * limit)
}
