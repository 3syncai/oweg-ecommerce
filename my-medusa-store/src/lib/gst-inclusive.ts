/**
 * OWEG prices are GST-inclusive. Back-calculate taxable value + GST
 * from vendor tax_code / gst_rate without adding tax on top.
 *
 * Coin / promo discounts reduce the inclusive base before GST is split.
 */

export type InclusiveGstBreakdown = {
  tax_code: string | null
  rate: number
  inclusive: number
  taxable: number
  gst: number
  cgst: number
  sgst: number
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

function toMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function parseGstRate(value: unknown): number | null {
  if (value == null || value === "") return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  const raw = String(value).trim().toUpperCase()
  const fromCode = raw.match(/^GST_([\d.]+)$/)
  if (fromCode) {
    const n = Number(fromCode[1])
    return Number.isFinite(n) ? n : null
  }
  const n = Number(raw.replace(/%/g, ""))
  return Number.isFinite(n) ? n : null
}

/**
 * Resolve order-level discount that should reduce the GST-inclusive base.
 * Prefer metadata (coin + OWEG10 + Medusa promo); fall back to Medusa discount_total.
 * Uses max() so coin already reflected in discount_total is not double-counted.
 */
export function resolveOrderGstDiscountRupees(
  metadata: Record<string, unknown> | null | undefined,
  discountTotal?: number | null
): {
  coin: number
  oweg10: number
  promo: number
  medusa: number
  total: number
} {
  const meta = metadata || {}
  const coin =
    toMoney(meta.coin_discount_rupees) ||
    toMoney(meta.coins_discounted) ||
    toMoney(meta.coins_discountend) ||
    (toMoney(meta.coin_discount_minor) > 0
      ? toMoney(meta.coin_discount_minor) / 100
      : 0)
  const oweg10 =
    toMoney(meta.oweg10_discount_rupees) ||
    (toMoney(meta.oweg10_discount_minor) > 0
      ? toMoney(meta.oweg10_discount_minor) / 100
      : 0)
  const promo =
    toMoney(meta.promo_discount_rupees) ||
    (toMoney(meta.promo_discount_minor) > 0
      ? toMoney(meta.promo_discount_minor) / 100
      : 0)
  const fromMeta = round2(coin + oweg10 + promo)
  const medusa = round2(Math.abs(toMoney(discountTotal)))
  return {
    coin: round2(coin),
    oweg10: round2(oweg10),
    promo: round2(promo),
    medusa,
    total: Math.max(fromMeta, medusa),
  }
}

/** Proportionally allocate an order discount across line inclusive amounts. */
export function allocateDiscountAcrossLines(
  lineAmounts: number[],
  discountRupees: number
): number[] {
  const amounts = lineAmounts.map((n) => Math.max(0, round2(n)))
  const total = round2(amounts.reduce((s, n) => s + n, 0))
  const discount = round2(Math.min(Math.max(0, discountRupees), total))
  if (discount <= 0 || total <= 0) {
    return amounts.map(() => 0)
  }

  const shares = amounts.map((amount) => round2((amount / total) * discount))
  let allocated = round2(shares.reduce((s, n) => s + n, 0))
  let diff = round2(discount - allocated)
  if (diff !== 0 && shares.length) {
    let idx = 0
    for (let i = 1; i < amounts.length; i++) {
      if (amounts[i] > amounts[idx]) idx = i
    }
    shares[idx] = round2(shares[idx] + diff)
  }
  return shares
}

export function breakdownInclusiveGst(
  inclusiveAmount: number,
  gstRatePercent: number,
  taxCode?: string | null
): InclusiveGstBreakdown {
  const inclusive = round2(Math.max(0, inclusiveAmount))
  const rate = Number(gstRatePercent) || 0

  if (inclusive <= 0 || rate <= 0) {
    return {
      tax_code: taxCode || (rate > 0 ? `GST_${rate}` : null),
      rate,
      inclusive,
      taxable: inclusive,
      gst: 0,
      cgst: 0,
      sgst: 0,
    }
  }

  const taxable = round2(inclusive / (1 + rate / 100))
  const gst = round2(inclusive - taxable)
  const half = round2(gst / 2)

  return {
    tax_code: taxCode || `GST_${rate}`,
    rate,
    inclusive,
    taxable,
    gst,
    cgst: half,
    sgst: round2(gst - half),
  }
}

export type OrderGstLine = InclusiveGstBreakdown & {
  item_id: string
  title: string
  quantity: number
  /** Line total before coin/promo discount */
  gross_inclusive?: number
  /** Discount share allocated to this line */
  discount?: number
}

export type OrderGstSummary = {
  lines: OrderGstLine[]
  taxable: number
  gst: number
  cgst: number
  sgst: number
  inclusive: number
  discount: number
  gross_inclusive: number
  note: string
}

export function summarizeOrderGst(
  lines: OrderGstLine[],
  options?: { discount?: number }
): OrderGstSummary {
  const taxable = round2(lines.reduce((s, l) => s + l.taxable, 0))
  const gst = round2(lines.reduce((s, l) => s + l.gst, 0))
  const cgst = round2(lines.reduce((s, l) => s + l.cgst, 0))
  const sgst = round2(lines.reduce((s, l) => s + l.sgst, 0))
  const inclusive = round2(lines.reduce((s, l) => s + l.inclusive, 0))
  const discount = round2(
    options?.discount ?? lines.reduce((s, l) => s + (Number(l.discount) || 0), 0)
  )
  const gross_inclusive = round2(
    lines.reduce(
      (s, l) => s + (Number(l.gross_inclusive) || Number(l.inclusive) || 0),
      0
    )
  )

  const note =
    discount > 0
      ? `Prices are GST-inclusive. Coin/promo discount of ₹${discount.toFixed(2)} is deducted from the inclusive base before GST is split (not extra tax on top).`
      : "Prices are GST-inclusive. Amounts below are a breakdown, not extra tax added on top."

  return {
    lines,
    taxable,
    gst,
    cgst,
    sgst,
    inclusive,
    discount,
    gross_inclusive,
    note,
  }
}
