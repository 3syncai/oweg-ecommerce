import { randomInt } from "node:crypto"
import { getSharedDbPool } from "./db-pool"

export type OfferCandidate = {
  variant_id: string
  product_id: string
  vendor_id: string
  sku: string
  available: number
  prices: number[]
  store_name?: string | null
}

export function publicSellerOffers(candidates: OfferCandidate[]) {
  return candidates
    .filter(offer => offer.available > 0 && offer.prices.length > 0)
    .map(offer => ({
      variant_id: offer.variant_id,
      store_name: offer.store_name || "OWEG seller",
      price: Math.min(...offer.prices),
      available: offer.available,
    }))
    .sort((a, b) => a.price - b.price || b.available - a.available || a.variant_id.localeCompare(b.variant_id))
}

export function chooseOffer(candidates: OfferCandidate[], quantity: number, price: number, excludedVendorIds: string[] = [], draw: (max: number) => number = randomInt): OfferCandidate | null {
  const eligible = candidates.filter(candidate =>
    !excludedVendorIds.includes(candidate.vendor_id) &&
    candidate.available >= quantity &&
    candidate.prices.some(amount => Math.abs(amount - price) < 0.005))
  if (!eligible.length) return null
  const largest = Math.max(...eligible.map(candidate => candidate.available))
  const tied = eligible.filter(candidate => candidate.available === largest)
  return tied[draw(tied.length)]
}

/** Read the same public SKU across published offers, with real free inventory. */
export async function listSameSkuOffers(variantId: string): Promise<OfferCandidate[]> {
  const { rows } = await getSharedDbPool().query<OfferCandidate>(`
    WITH origin AS (
      SELECT p.id AS product_id,
        COALESCE(NULLIF(p.metadata->>'catalog_product_id', ''), p.id) AS catalog_id,
        UPPER(BTRIM(COALESCE(p.metadata->'catalog_skus'->>v.sku, v.sku, ''))) AS public_sku
      FROM product_variant v JOIN product p ON p.id = v.product_id
      WHERE v.id = $1 AND v.deleted_at IS NULL AND p.deleted_at IS NULL
    )
    SELECT v.id AS variant_id, p.id AS product_id, p.metadata->>'vendor_id' AS vendor_id,
      COALESCE(NULLIF(BTRIM(seller.store_name), ''), 'OWEG seller') AS store_name,
      origin.public_sku AS sku,
      COALESCE((SELECT SUM(GREATEST(il.stocked_quantity - il.reserved_quantity, 0) / GREATEST(pvii.required_quantity, 1))
        FROM product_variant_inventory_item pvii
        JOIN inventory_level il ON il.inventory_item_id = pvii.inventory_item_id AND il.deleted_at IS NULL
        JOIN stock_location sl ON sl.id = il.location_id AND sl.deleted_at IS NULL AND sl.name = 'Default Warehouse'
        WHERE pvii.variant_id = v.id AND pvii.deleted_at IS NULL), 0)::numeric AS available,
      COALESCE((SELECT ARRAY_AGG(DISTINCT price.amount::numeric)
        FROM product_variant_price_set pvps JOIN price ON price.price_set_id = pvps.price_set_id
        LEFT JOIN price_list pl ON pl.id = price.price_list_id
        WHERE pvps.variant_id = v.id AND pvps.deleted_at IS NULL AND price.deleted_at IS NULL
          AND price.currency_code = 'inr' AND COALESCE(price.rules_count, 0) = 0
          AND (price.price_list_id IS NULL OR (pl.status = 'active' AND pl.deleted_at IS NULL
            AND COALESCE(pl.rules_count, 0) = 0 AND (pl.starts_at IS NULL OR pl.starts_at <= now())
            AND (pl.ends_at IS NULL OR pl.ends_at > now())))), ARRAY[]::numeric[]) AS prices
    FROM origin
    JOIN product p ON COALESCE(NULLIF(p.metadata->>'catalog_product_id', ''), p.id) = origin.catalog_id
      AND p.deleted_at IS NULL AND p.status = 'published'
      AND COALESCE(p.metadata->>'approval_status', 'approved') = 'approved'
      AND NULLIF(p.metadata->>'vendor_id', '') IS NOT NULL
    JOIN product_variant v ON v.product_id = p.id AND v.deleted_at IS NULL
    LEFT JOIN vendor seller ON seller.id = p.metadata->>'vendor_id' AND seller.deleted_at IS NULL
    WHERE origin.public_sku <> ''
      AND UPPER(BTRIM(COALESCE(p.metadata->'catalog_skus'->>v.sku, v.sku, ''))) = origin.public_sku
  `, [variantId])
  return rows.map(row => ({ ...row, available: Number(row.available), prices: (row.prices || []).map(Number) }))
}

export async function selectSameSkuOffer(variantId: string, quantity: number, price: number, excludedVendorIds: string[] = []) {
  if (!variantId || !Number.isSafeInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) return null
  return chooseOffer(await listSameSkuOffers(variantId), quantity, price, excludedVendorIds)
}
