import type { Pool } from "pg"

/**
 * SQL mirror of GET /vendor/returns: return requests that include at least one
 * line item whose product belongs to the vendor (by product id list).
 */
const OWNED_RETURN_ITEMS_SQL = `
  SELECT DISTINCT rri.return_request_id, rri.order_item_id
  FROM return_request_item rri
  LEFT JOIN order_line_item oli ON oli.id = rri.order_item_id
  LEFT JOIN order_item oi ON oi.id = rri.order_item_id OR oi.item_id = rri.order_item_id
  LEFT JOIN order_line_item oli2 ON oli2.id = oi.item_id
  LEFT JOIN product_variant pv ON pv.id = COALESCE(oli.variant_id, oli2.variant_id)
  WHERE rri.return_request_id = ANY($1::text[])
    AND rri.deleted_at IS NULL
    AND COALESCE(oli.product_id, oli2.product_id, pv.product_id) = ANY($2::text[])
`

export type OwnedReturnItemsMap = Map<string, Set<string>>

export async function loadOwnedReturnRequestItems(
  pool: Pool,
  returnRequestIds: string[],
  vendorProductIds: string[]
): Promise<OwnedReturnItemsMap> {
  const owned = new Map<string, Set<string>>()
  if (!returnRequestIds.length || !vendorProductIds.length) return owned

  const { rows } = await pool.query<{ return_request_id: string; order_item_id: string }>(
    OWNED_RETURN_ITEMS_SQL,
    [returnRequestIds, vendorProductIds]
  )
  for (const row of rows) {
    const items = owned.get(row.return_request_id) || new Set<string>()
    items.add(row.order_item_id)
    owned.set(row.return_request_id, items)
  }
  return owned
}

export function ownedReturnRequestIdSet(ownedItems: OwnedReturnItemsMap): Set<string> {
  return new Set(ownedItems.keys())
}

export async function returnRequestOwnedByVendorProducts(
  pool: Pool,
  returnRequestId: string,
  vendorProductIds: string[]
): Promise<boolean> {
  if (!returnRequestId || !vendorProductIds.length) return false
  const owned = await loadOwnedReturnRequestItems(pool, [returnRequestId], vendorProductIds)
  return owned.has(returnRequestId)
}
