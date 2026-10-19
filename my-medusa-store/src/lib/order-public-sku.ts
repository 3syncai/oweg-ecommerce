import type { Pool } from "pg"

/** Show the catalog SKU on order snapshots while retaining unique inventory SKUs on variants. */
export async function normalizeOrderPublicSkus(orderId: string, pool: Pool): Promise<number> {
  const result = await pool.query(`
    UPDATE order_line_item oli
    SET variant_sku = p.metadata->'catalog_skus'->>pv.sku,
        updated_at = now()
    FROM order_item oi, product_variant pv, product p
    WHERE oi.item_id=oli.id AND oi.order_id=$1
      AND oi.version=(SELECT version FROM "order" WHERE id=$1)
      AND oi.deleted_at IS NULL AND oli.deleted_at IS NULL
      AND pv.id=oli.variant_id AND p.id=pv.product_id
      AND oli.variant_sku LIKE 'OWEG-OFFER-%'
      AND NULLIF(p.metadata->'catalog_skus'->>pv.sku,'') IS NOT NULL
    RETURNING oli.id`, [orderId])
  return result.rowCount || 0
}
