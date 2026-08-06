import type { Pool } from "pg"

const ORDER_ID_CACHE_TTL_MS = 15_000
const orderIdCache = new Map<string, { at: number; ids: string[] }>()

/**
 * Resolve order IDs that contain at least one product owned by the vendor.
 * Prefer SQL over loading every order in the marketplace.
 */
export async function findVendorOrderIds(
  pool: Pool,
  vendorId: string,
  vendorProductIds: string[]
): Promise<string[]> {
  if (!vendorProductIds.length) return []

  const cached = orderIdCache.get(vendorId)
  if (cached && Date.now() - cached.at < ORDER_ID_CACHE_TTL_MS) {
    return cached.ids
  }

  // Fast path: match by product_id on line items (covers most Medusa v2 orders)
  const byProduct = await pool.query<{ order_id: string }>(
    `
      SELECT DISTINCT oi.order_id
      FROM order_item oi
      JOIN order_line_item oli ON oi.item_id = oli.id
      LEFT JOIN product_variant pv ON oli.variant_id = pv.id
      WHERE COALESCE(oli.product_id, pv.product_id) = ANY($1::text[])
    `,
    [vendorProductIds]
  )

  const ids = new Set(byProduct.rows.map((row) => row.order_id).filter(Boolean))

  // Fallback: older rows / odd joins where product_id is missing but product.metadata.vendor_id is set
  if (ids.size === 0) {
    const byVendorMeta = await pool.query<{ order_id: string }>(
      `
        SELECT DISTINCT oi.order_id
        FROM order_item oi
        JOIN order_line_item oli ON oi.item_id = oli.id
        LEFT JOIN product_variant pv ON oli.variant_id = pv.id
        LEFT JOIN product p ON COALESCE(oli.product_id, pv.product_id) = p.id
        WHERE p.metadata->>'vendor_id' = $1
      `,
      [vendorId]
    )
    for (const row of byVendorMeta.rows) {
      if (row.order_id) ids.add(row.order_id)
    }
  }

  const list = Array.from(ids)
  orderIdCache.set(vendorId, { at: Date.now(), ids: list })
  return list
}

/** Call after accept / ship / status changes so the next list is fresh. */
export function invalidateVendorOrderIdCache(vendorId?: string) {
  if (vendorId) orderIdCache.delete(vendorId)
  else orderIdCache.clear()
}
