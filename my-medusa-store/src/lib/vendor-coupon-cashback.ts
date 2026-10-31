import type { Pool } from "pg"

type CouponLine = {
  vendor_id: string | null
  line_total: string | number
  coupon_discount: string | number
}

const money = (value: unknown): number => {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0
}

function metadataAmount(metadata: Record<string, unknown>, key: string): number {
  return money(metadata[`${key}_rupees`]) || money(Number(metadata[`${key}_minor`]) / 100)
}

/** Coin redeem amount in minor units (paise). Prefer explicit rupee/minor keys. */
function coinMetadataAmount(metadata: Record<string, unknown>): number {
  return (
    metadataAmount(metadata, "coin_discount") ||
    money(metadata.coins_discounted) ||
    money(metadata.coins_discountend)
  )
}

/**
 * Split an order-wide discount across line totals using largest-remainder.
 * Returns per-line amounts in minor units, summing exactly to `discount`.
 */
function allocateProportionally(discount: number, amounts: number[], subtotal: number): number[] {
  if (discount <= 0 || subtotal <= 0) return amounts.map(() => 0)
  const capped = Math.min(subtotal, discount)
  const shares = amounts.map((amount) => Math.floor((capped * amount) / subtotal))
  let remaining = capped - shares.reduce((sum, amount) => sum + amount, 0)
  const priority = amounts
    .map((amount, index) => ({ index, remainder: (capped * amount) % subtotal }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const { index } of priority) {
    if (remaining-- <= 0) break
    shares[index] += 1
  }
  return shares
}

/**
 * Vendor cashback = customer coupon discount + redeemed wallet coins.
 * - coupon only → coupon amount
 * - coins only → coin amount
 * - coupon + coins → sum of both
 * Amounts are actual applied discounts in rupees (never coupon face values).
 */
export function allocateVendorCouponCashback(
  metadata: Record<string, unknown> | null,
  lines: CouponLine[]
): Map<string, number> {
  const result = new Map<string, number>()
  const amounts = lines.map((line) => money(line.line_total))
  const subtotal = amounts.reduce((sum, amount) => sum + amount, 0)
  const meta = metadata || {}
  const couponMeta =
    metadataAmount(meta, "promo_discount") + metadataAmount(meta, "oweg10_discount")
  const coinMeta = coinMetadataAmount(meta)

  // Order-wide admin promo: allocate coupon (+ coins if present) across all items.
  // Native item coupons: keep per-line coupon shares, then layer coin redeem on top.
  const couponShares =
    couponMeta > 0 && subtotal > 0
      ? allocateProportionally(couponMeta, amounts, subtotal)
      : lines.map((line, index) => Math.min(amounts[index], money(line.coupon_discount)))

  const coinShares =
    coinMeta > 0 && subtotal > 0
      ? allocateProportionally(coinMeta, amounts, subtotal)
      : amounts.map(() => 0)

  lines.forEach((line, index) => {
    if (!line.vendor_id) return
    const share = Math.min(amounts[index], couponShares[index] + coinShares[index])
    result.set(line.vendor_id, (result.get(line.vendor_id) || 0) + share)
  })
  return new Map([...result].map(([vendor, cents]) => [vendor, cents / 100]))
}

export async function fetchVendorCouponCashback(orderId: string, pool: Pool): Promise<Map<string, number>> {
  const result = await pool.query<CouponLine & { metadata: Record<string, unknown> | null }>(`
    SELECT DISTINCT ON (oli.id)
      o.metadata,
      p.metadata->>'vendor_id' AS vendor_id,
      oli.unit_price::numeric * GREATEST(COALESCE(oi.quantity, 1), 1) AS line_total,
      COALESCE((
        SELECT SUM(GREATEST(a.amount::numeric, 0) *
          CASE WHEN a.is_tax_inclusive THEN 1 ELSE 1 + COALESCE((
            SELECT SUM(t.rate::numeric) / 100
            FROM order_line_item_tax_line t
            WHERE t.item_id = oli.id AND t.deleted_at IS NULL
          ), 0) END)
        FROM order_line_item_adjustment a
        WHERE a.item_id = oli.id AND a.deleted_at IS NULL
          AND (a.promotion_id IS NOT NULL OR NULLIF(a.code, '') IS NOT NULL)
          AND UPPER(COALESCE(a.code, '')) NOT LIKE 'OWEG_COINS%'
          AND UPPER(COALESCE(a.code, '')) NOT LIKE 'COINS-%'
          AND COALESCE(a.provider_id, '') <> 'oweg-wallet'
      ), 0) AS coupon_discount
    FROM order_item oi
    JOIN order_line_item oli ON oi.item_id = oli.id
    JOIN "order" o ON o.id = oi.order_id
    LEFT JOIN product_variant pv ON oli.variant_id = pv.id
    LEFT JOIN product p ON COALESCE(oli.product_id, pv.product_id) = p.id
    WHERE oi.order_id = $1 AND oi.deleted_at IS NULL AND oli.deleted_at IS NULL
    ORDER BY oli.id
  `, [orderId])
  return allocateVendorCouponCashback(result.rows[0]?.metadata || null, result.rows)
}
