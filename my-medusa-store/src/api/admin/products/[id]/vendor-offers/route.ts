import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getSharedDbPool } from "../../../../../lib/db-pool"

type OfferRow = {
  catalog_product_id: string
  product_id: string
  product_status: string
  approval_status: string
  vendor_id: string
  vendor_name: string | null
  store_name: string | null
  email: string | null
  vendor_approved: boolean | null
  variant_id: string
  variant_title: string | null
  public_sku: string | null
  manage_inventory: boolean
  available: string | number | null
  price: string | number | null
  authorization_verified: boolean | null
  authorization_status: string | null
}

/** Every vendor listing connected to the same customer-facing catalog product. */
export async function GET(req: MedusaRequest<{ id: string }>, res: MedusaResponse) {
  const productId = String(req.params.id || "")
  if (!productId || productId.length > 255) {
    return res.status(400).json({ message: "Product ID is required" })
  }

  const specialPriceListId = process.env.OWEG_SPECIAL_PRICE_LIST_ID || "pl_1765232034558"

  try {
    const { rows } = await getSharedDbPool().query<OfferRow>(`
      WITH origin AS (
        SELECT
          COALESCE(NULLIF(metadata->>'catalog_product_id', ''), id) AS catalog_product_id,
          COALESCE(NULLIF(metadata->>'brand', ''), '') AS brand_name
        FROM product
        WHERE id = $1 AND deleted_at IS NULL
      )
      SELECT
        origin.catalog_product_id,
        p.id AS product_id,
        p.status AS product_status,
        COALESCE(NULLIF(p.metadata->>'approval_status', ''), 'approved') AS approval_status,
        p.metadata->>'vendor_id' AS vendor_id,
        seller.name AS vendor_name,
        seller.store_name,
        seller.email,
        seller.is_approved AS vendor_approved,
        v.id AS variant_id,
        v.title AS variant_title,
        COALESCE(NULLIF(p.metadata->'catalog_skus'->>v.sku, ''), v.sku) AS public_sku,
        v.manage_inventory,
        CASE WHEN v.manage_inventory = false THEN NULL ELSE COALESCE((
          SELECT SUM(GREATEST(il.stocked_quantity - il.reserved_quantity, 0) / GREATEST(pvii.required_quantity, 1))
          FROM product_variant_inventory_item pvii
          JOIN inventory_level il ON il.inventory_item_id = pvii.inventory_item_id AND il.deleted_at IS NULL
          WHERE pvii.variant_id = v.id AND pvii.deleted_at IS NULL
        ), 0) END AS available,
        COALESCE((
          SELECT MIN(price.amount)
          FROM product_variant_price_set pvps
          JOIN price ON price.price_set_id = pvps.price_set_id
          LEFT JOIN price_list pl ON pl.id = price.price_list_id
          WHERE pvps.variant_id = v.id
            AND pvps.deleted_at IS NULL
            AND price.deleted_at IS NULL
            AND price.currency_code = 'inr'
            AND COALESCE(price.rules_count, 0) = 0
            AND (price.price_list_id IS NULL OR (
              pl.status = 'active' AND pl.deleted_at IS NULL
              AND (COALESCE(pl.rules_count, 0) = 0 OR pl.id = $2)
              AND (pl.starts_at IS NULL OR pl.starts_at <= now())
              AND (pl.ends_at IS NULL OR pl.ends_at > now())
            ))
        ), 0) AS price,
        auth_record.verified AS authorization_verified,
        COALESCE(
          auth_record.metadata->>'review_status',
          CASE
            WHEN auth_record.verified = true THEN 'approved'
            WHEN auth_record.verified = false THEN 'pending'
            ELSE NULL
          END
        ) AS authorization_status
      FROM origin
      JOIN product p
        ON COALESCE(NULLIF(p.metadata->>'catalog_product_id', ''), p.id) = origin.catalog_product_id
        AND p.deleted_at IS NULL
        AND NULLIF(p.metadata->>'vendor_id', '') IS NOT NULL
      JOIN product_variant v ON v.product_id = p.id AND v.deleted_at IS NULL
      LEFT JOIN vendor seller ON seller.id = p.metadata->>'vendor_id' AND seller.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT auth.verified, auth.metadata
        FROM vendor_brand_authorization auth
        WHERE auth.vendor_id = p.metadata->>'vendor_id'
          AND LOWER(auth.brand_name) = LOWER(COALESCE(NULLIF(p.metadata->>'brand', ''), origin.brand_name))
          AND auth.deleted_at IS NULL
        ORDER BY auth.updated_at DESC
        LIMIT 1
      ) auth_record ON true
      ORDER BY COALESCE(NULLIF(seller.store_name, ''), seller.name, seller.email), p.created_at, v.created_at
    `, [productId, specialPriceListId])

    if (!rows.length) {
      return res.status(404).json({ message: "Product or vendor offers not found" })
    }

    const grouped = new Map<string, any>()
    for (const row of rows) {
      const current = grouped.get(row.product_id) || {
        product_id: row.product_id,
        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
        store_name: row.store_name,
        email: row.email,
        vendor_approved: row.vendor_approved === true,
        product_status: row.product_status,
        approval_status: row.approval_status,
        authorization_status: row.authorization_verified
          ? "approved"
          : row.authorization_status || "missing",
        variants: [],
      }
      current.variants.push({
        id: row.variant_id,
        title: row.variant_title,
        sku: row.public_sku,
        price: Number(row.price || 0),
        available: row.manage_inventory ? Number(row.available || 0) : null,
        manages_inventory: row.manage_inventory,
      })
      grouped.set(row.product_id, current)
    }

    const vendors = Array.from(grouped.values()).map((offer) => {
      const prices = offer.variants.map((variant: any) => variant.price).filter((price: number) => price > 0)
      const managedStock = offer.variants
        .map((variant: any) => variant.available)
        .filter((stock: number | null) => stock !== null)
      return {
        ...offer,
        minimum_price: prices.length ? Math.min(...prices) : 0,
        maximum_price: prices.length ? Math.max(...prices) : 0,
        available: managedStock.length ? managedStock.reduce((sum: number, stock: number) => sum + stock, 0) : null,
      }
    }).sort((a, b) =>
      (a.minimum_price || Number.POSITIVE_INFINITY) - (b.minimum_price || Number.POSITIVE_INFINITY)
      || Number(b.available || 0) - Number(a.available || 0))

    return res.json({
      catalog_product_id: rows[0].catalog_product_id,
      vendor_count: vendors.length,
      vendors,
    })
  } catch (error) {
    console.error("[admin product vendor offers] failed", error)
    return res.status(500).json({ message: "Could not load vendors for this product" })
  }
}
