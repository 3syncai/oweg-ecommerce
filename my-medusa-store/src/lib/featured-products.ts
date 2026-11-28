import { randomUUID } from "node:crypto"
import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { parseFeaturedProducts, type FeaturedPickerProduct, type FeaturedProductsConfig } from "../shared/featured-products"

type Connection = {
  raw<T>(sql: string, bindings?: unknown[]): Promise<{ rows: T[] }>
}

function connection(req: MedusaRequest) {
  return req.scope.resolve<Connection>(ContainerRegistrationKeys.PG_CONNECTION)
}

export async function readFeaturedProducts(req: MedusaRequest) {
  const { rows } = await connection(req).raw<{ config: unknown; revision: string | null }>(
    `SELECT metadata->'oweg_featured_products' AS config,
            metadata->'oweg_featured_products'->>'revision' AS revision
       FROM store WHERE deleted_at IS NULL ORDER BY id LIMIT 1`
  )
  return {
    config: parseFeaturedProducts(rows[0]?.config) ?? { title: "Featured products", product_ids: [] },
    revision: rows[0]?.revision ?? null,
  }
}

export async function publishFeaturedProducts(req: MedusaRequest, config: FeaturedProductsConfig, expectedRevision: string | null) {
  const revision = randomUUID()
  const { rows } = await connection(req).raw<{ id: string }>(
    `UPDATE store
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{oweg_featured_products}', ?::jsonb),
            updated_at = now()
      WHERE id = (SELECT id FROM store WHERE deleted_at IS NULL ORDER BY id LIMIT 1)
        AND deleted_at IS NULL
        AND (metadata->'oweg_featured_products'->>'revision') IS NOT DISTINCT FROM ?::text
      RETURNING id`,
    [JSON.stringify({ ...config, revision }), expectedRevision]
  )
  return rows.length ? revision : null
}
type PickerProduct = Pick<FeaturedPickerProduct, "id" | "title" | "status" | "thumbnail">
type PickerDetails = {
  id: string
  vendor: string | null
  min_mrp: string | number | null
  max_mrp: string | number | null
  min_selling: string | number | null
  max_selling: string | number | null
}

export async function addFeaturedPickerDetails(req: MedusaRequest, products: PickerProduct[]): Promise<FeaturedPickerProduct[]> {
  if (!products.length) return []
  const specialListId = process.env.OWEG_SPECIAL_PRICE_LIST_ID || "pl_1765232034558"
  const { rows } = await connection(req).raw<PickerDetails>(
    `SELECT product.id,
            COALESCE(NULLIF(BTRIM(vendor.store_name), ''), NULLIF(BTRIM(vendor.name), '')) AS vendor,
            prices.min_mrp, prices.max_mrp, prices.min_selling, prices.max_selling
       FROM product
       LEFT JOIN vendor ON vendor.id = product.metadata->>'vendor_id' AND vendor.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT MIN(offer.mrp) AS min_mrp, MAX(offer.mrp) AS max_mrp,
                MIN(offer.selling) AS min_selling, MAX(offer.selling) AS max_selling
           FROM (
             SELECT MIN(price.amount) FILTER (WHERE price.price_list_id IS NULL) AS mrp,
                    MIN(price.amount) AS selling
               FROM product_variant variant
               JOIN product_variant_price_set link ON link.variant_id = variant.id AND link.deleted_at IS NULL
               JOIN price ON price.price_set_id = link.price_set_id
               LEFT JOIN price_list list ON list.id = price.price_list_id
              WHERE variant.product_id = product.id AND variant.deleted_at IS NULL
                AND price.deleted_at IS NULL AND price.currency_code = 'inr'
                AND COALESCE(price.rules_count, 0) = 0
                AND price.min_quantity IS NULL AND price.max_quantity IS NULL AND price.amount > 0
                AND (price.price_list_id IS NULL OR (
                  list.status = 'active' AND list.deleted_at IS NULL
                  AND (COALESCE(list.rules_count, 0) = 0 OR list.id = ?)
                  AND (list.starts_at IS NULL OR list.starts_at <= now())
                  AND (list.ends_at IS NULL OR list.ends_at > now())
                ))
              GROUP BY variant.id
           ) offer
       ) prices ON true
       WHERE product.id = ANY(?::text[]) AND product.deleted_at IS NULL`,
    [specialListId, products.map(product => product.id)]
  )
  const details = new Map(rows.map(row => [row.id, row]))
  return products.map(product => {
    const row = details.get(product.id)
    const mrp = row?.min_mrp == null ? null : Number(row.min_mrp)
    const sellingPrice = row?.min_selling == null ? null : Number(row.min_selling)
    return {
      ...product,
      vendor: row?.vendor ?? null,
      mrp,
      selling_price: sellingPrice,
      has_mrp_range: mrp !== null && Number(row?.max_mrp) > mrp,
      has_selling_price_range: sellingPrice !== null && Number(row?.max_selling) > sellingPrice,
    }
  })
}

export async function readFeaturedPickerPage(req: MedusaRequest, query: string, cursor: string | null) {
  const pageSize = 16
  const pattern = query ? "%" + query.replace(/[!%_]/g, "!$&") + "%" : null
  const { rows } = await connection(req).raw<PickerProduct>(
    `SELECT id, title, status, thumbnail FROM product
      WHERE deleted_at IS NULL AND status = 'published'
        AND (?::text IS NULL OR id < ?::text)
        AND (?::text IS NULL OR title ILIKE ?::text ESCAPE '!')
      ORDER BY id DESC LIMIT ?`,
    [cursor, cursor, pattern, pattern, pageSize + 1]
  )
  const page = rows.slice(0, pageSize)
  return {
    products: await addFeaturedPickerDetails(req, page),
    next_cursor: rows.length > pageSize ? page[page.length - 1].id : null,
  }
}
