import type { Pool } from "pg"

/** Vendors attached to the current order version, excluding previous sellers. */
export async function listCurrentOrderVendorIds(orderId: string, pool: Pool) {
  const { rows } = await pool.query<{ vendor_id: string }>(`
    SELECT DISTINCT p.metadata->>'vendor_id' AS vendor_id
    FROM "order" o
    JOIN order_item oi ON oi.order_id=o.id AND oi.version=o.version AND oi.deleted_at IS NULL
    JOIN order_line_item oli ON oli.id=oi.item_id AND oli.deleted_at IS NULL
    LEFT JOIN product_variant pv ON pv.id=oli.variant_id
    JOIN product p ON p.id=COALESCE(oli.product_id,pv.product_id)
    WHERE o.id=$1 AND NULLIF(p.metadata->>'vendor_id','') IS NOT NULL
      AND COALESCE(oi.quantity,0)>0
  `, [orderId])
  return rows.map((row) => row.vendor_id)
}
