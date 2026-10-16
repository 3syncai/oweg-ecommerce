/** Only these top-level fields may leave the customer order overview endpoint. */
export const CUSTOMER_ORDER_SUMMARY_FIELDS = [
  "id",
  "display_id",
  "created_at",
  "status",
  "currency_code",
  "total",
  "payment_status",
  "fulfillment_status",
] as const

export function customerOrderSummary(order: object) {
  const fields = order as Record<string, unknown>
  return Object.fromEntries(
    CUSTOMER_ORDER_SUMMARY_FIELDS.map((field) => [field, fields[field] ?? null])
  )
}

export function summaryPagination(query: Record<string, unknown>) {
  if (Object.keys(query).some((key) => !["offset", "limit"].includes(key)))
    throw new Error("Only offset and limit are supported")
  const integer = (value: unknown, fallback: number, max: number) => {
    if (value === undefined) return fallback
    if (
      typeof value !== "string" ||
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) > max
    )
      throw new Error("Invalid pagination")
    return Number(value)
  }
  const offset = integer(query.offset, 0, 1_000_000)
  const limit = integer(query.limit, 10, 50)
  if (!limit) throw new Error("Limit must be at least one")
  return { skip: offset, take: limit }
}
