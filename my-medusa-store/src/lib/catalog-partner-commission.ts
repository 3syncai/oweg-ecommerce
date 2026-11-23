/**
 * National Head / partner-portal catalog commission → vendor partner cut.
 *
 * Vendor F = C × partner% must use the product (catalog) rate that was
 * active when the order was placed — never a store-wide fixed %, never a
 * rate configured after the order, never a soft-deleted / expired rule.
 */

import type { Pool } from "pg"

export type CommissionDb = Pick<Pool, "query">

export class CatalogCommissionConflict extends Error {}

function validCommissionRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
}

function asOfTimestamp(asOf?: Date | string | null): Date {
  if (!asOf) return new Date()
  const d = asOf instanceof Date ? asOf : new Date(asOf)
  return Number.isFinite(d.getTime()) ? d : new Date()
}

/** Follow server-owned catalog_product_id links only; never match titles or SKUs. */
export async function catalogCommissionFamily(
  db: CommissionDb,
  productId: string
): Promise<string[]> {
  const path: string[] = []
  let current = productId
  while (current) {
    if (path.includes(current) || path.length >= 32) {
      throw new CatalogCommissionConflict(
        "Invalid catalog linkage; ask the catalog admin to repair it."
      )
    }
    path.push(current)
    const result = await db.query(
      "SELECT id, metadata FROM product WHERE id=$1 AND deleted_at IS NULL",
      [current]
    )
    const product = result.rows[0]
    if (!product) {
      throw new CatalogCommissionConflict("Catalog product is missing or deleted.")
    }
    const parent = product.metadata?.catalog_product_id
    if (!parent || parent === current) break
    if (typeof parent !== "string") {
      throw new CatalogCommissionConflict("Invalid catalog linkage.")
    }
    current = parent
  }
  const canonical = path[path.length - 1]
  const result = await db.query(
    `WITH RECURSIVE family AS (
      SELECT id, ARRAY[id::text] AS visited FROM product WHERE id=$1 AND deleted_at IS NULL
      UNION ALL
      SELECT p.id, f.visited || p.id::text FROM product p JOIN family f
        ON p.metadata->>'catalog_product_id'=f.id
      WHERE p.deleted_at IS NULL AND NOT p.id=ANY(f.visited) AND cardinality(f.visited)<32
    ) SELECT DISTINCT id FROM family ORDER BY id`,
    [canonical]
  )
  return [
    canonical,
    ...result.rows.map((row) => String(row.id)).filter((id) => id !== canonical),
  ]
}

export type CatalogCommissionRule = {
  id: string
  rate: number
  source: string
  categoryId: string | null
}

/**
 * Resolve the NH catalog commission that was in force at `asOf`.
 * Rules created after `asOf`, or soft-deleted on/before `asOf`, do not apply.
 */
export async function lookupCatalogCommissionAt(
  db: CommissionDb,
  productId: string,
  asOf?: Date | string | null
): Promise<CatalogCommissionRule | null> {
  const at = asOfTimestamp(asOf)
  const family = await catalogCommissionFamily(db, productId)

  const direct = await db.query(
    `SELECT id, commission_rate
     FROM affiliate_commission
     WHERE product_id = ANY($1::text[])
       AND created_at <= $2
       AND (deleted_at IS NULL OR deleted_at > $2)
     ORDER BY id`,
    [family, at.toISOString()]
  )

  if (direct.rows.length) {
    const rates = new Set(direct.rows.map((row) => Number(row.commission_rate)))
    if (rates.size !== 1) {
      throw new CatalogCommissionConflict(
        "Linked listings have conflicting commission rules. Set one common catalog rate first."
      )
    }
    const row = direct.rows[0]
    const rate = Number(row.commission_rate)
    if (!validCommissionRate(rate)) {
      throw new CatalogCommissionConflict("Invalid catalog commission rate.")
    }
    return { id: row.id, rate, source: "catalog", categoryId: null }
  }

  const fallback = await db.query(
    `WITH RECURSIVE categories AS (
      SELECT pc.id, pc.parent_category_id
      FROM product_category pc
      JOIN product_category_product link ON link.product_category_id = pc.id
      WHERE link.product_id = $1 AND pc.deleted_at IS NULL
      UNION
      SELECT pc.id, pc.parent_category_id
      FROM product_category pc
      JOIN categories c ON c.parent_category_id = pc.id
      WHERE pc.deleted_at IS NULL
    )
    SELECT ac.id, ac.commission_rate, ac.category_id,
      CASE
        WHEN ac.category_id IS NOT NULL THEN 'category'
        WHEN ac.collection_id IS NOT NULL THEN 'collection'
        ELSE 'type'
      END AS source
    FROM affiliate_commission ac
    JOIN product p ON p.id = $1
    WHERE ac.created_at <= $2
      AND (ac.deleted_at IS NULL OR ac.deleted_at > $2)
      AND ac.product_id IS NULL
      AND (
        ac.category_id IN (SELECT id FROM categories)
        OR (ac.category_id IS NULL AND ac.collection_id = p.collection_id)
        OR (
          ac.category_id IS NULL
          AND ac.collection_id IS NULL
          AND ac.type_id = p.type_id
        )
      )
    ORDER BY
      CASE
        WHEN ac.category_id IS NOT NULL THEN 1
        WHEN ac.collection_id IS NOT NULL THEN 2
        ELSE 3
      END,
      ac.commission_rate DESC,
      ac.id
    LIMIT 1`,
    [family[0], at.toISOString()]
  )

  const row = fallback.rows[0]
  if (!row) return null
  const rate = Number(row.commission_rate)
  if (!validCommissionRate(rate)) {
    throw new CatalogCommissionConflict("Invalid commission rate.")
  }
  return {
    id: row.id,
    rate,
    source: String(row.source || "category"),
    categoryId: row.category_id ?? null,
  }
}

/** Soft lookup — settlement must never fail closed into a store-wide default. */
export async function safeLookupCatalogCommissionAt(
  db: CommissionDb,
  productId: string,
  asOf?: Date | string | null
): Promise<CatalogCommissionRule | null> {
  try {
    return await lookupCatalogCommissionAt(db, productId, asOf)
  } catch (err) {
    console.error(
      `[catalog-partner-commission] lookup failed for ${productId}:`,
      err
    )
    return null
  }
}

export type VendorLineCommissionInput = {
  product_id: string
  line_total: number
}

/**
 * Weighted partner % for a vendor's lines on one order.
 * Missing / expired / not-yet-created rules contribute 0 for that line.
 */
export function weightedPartnerRateFromLines(
  lines: Array<{ line_total: number; rate: number }>
): number {
  let weighted = 0
  let base = 0
  for (const line of lines) {
    const total = Math.max(0, Number(line.line_total) || 0)
    if (total <= 0) continue
    const rate = Math.max(0, Math.min(100, Number(line.rate) || 0))
    weighted += total * rate
    base += total
  }
  if (base <= 0) return 0
  return Math.round((weighted / base) * 10000) / 10000
}

/**
 * Load this vendor's order lines and resolve the order-time catalog partner %.
 * Returns 0 when no product on the order has an active NH commission at `asOf`.
 */
export async function resolveVendorOrderPartnerRate(params: {
  pool: CommissionDb
  orderId: string
  vendorId: string
  asOf?: Date | string | null
}): Promise<number> {
  const { pool, orderId, vendorId } = params
  const at = asOfTimestamp(params.asOf)

  const result = await pool.query<{
    product_id: string | null
    line_total: string | number | null
  }>(
    `
      SELECT DISTINCT ON (oli.id)
        COALESCE(oli.product_id, pv.product_id) AS product_id,
        (oli.unit_price::numeric) * GREATEST(COALESCE(oi.quantity, 1), 1) AS line_total
      FROM order_item oi
      JOIN order_line_item oli ON oi.item_id = oli.id
      LEFT JOIN product_variant pv ON oli.variant_id = pv.id
      LEFT JOIN product p ON COALESCE(oli.product_id, pv.product_id) = p.id
      WHERE oi.order_id = $1
        AND oi.deleted_at IS NULL
        AND TRIM(COALESCE(p.metadata->>'vendor_id', '')) = $2
      ORDER BY oli.id, oi.version DESC NULLS LAST
    `,
    [orderId, vendorId]
  )

  const scored: Array<{ line_total: number; rate: number }> = []
  for (const row of result.rows) {
    const productId = String(row.product_id || "").trim()
    const lineTotal = Number(row.line_total) || 0
    if (!productId || lineTotal <= 0) continue
    const rule = await safeLookupCatalogCommissionAt(pool, productId, at)
    scored.push({ line_total: lineTotal, rate: rule?.rate ?? 0 })
  }

  return weightedPartnerRateFromLines(scored)
}

export async function fetchOrderCreatedAt(
  pool: CommissionDb,
  orderId: string
): Promise<Date> {
  const result = await pool.query<{ created_at: Date | string | null }>(
    `SELECT created_at FROM "order" WHERE id = $1 LIMIT 1`,
    [orderId]
  )
  return asOfTimestamp(result.rows[0]?.created_at)
}
