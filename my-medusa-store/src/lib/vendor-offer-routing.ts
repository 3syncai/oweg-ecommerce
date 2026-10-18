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
  vendor_name?: string | null
  vendor_email?: string | null
  product_title?: string | null
  variant_title?: string | null
  store_pincode?: string | null
  latitude?: number | null
  longitude?: number | null
}

export type OfferSelection = {
  selected: OfferCandidate | null
  reason: "nearest_postal_centroid" | "same_postal_code" | "distance_unavailable_random" | "equal_distance_random" | "only_eligible" | "no_eligible"
  candidates: Array<{ vendor_id: string; variant_id: string; available: number; distance_km: number | null; store_pincode: string | null }>
}

function validCoordinate(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude), lon = Number(longitude)
  return latitude != null && longitude != null && Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

/** Great-circle distance between verified postal centroids, in kilometres. */
export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = Math.PI / 180
  const deltaLat = (b.latitude - a.latitude) * radians
  const deltaLon = (b.longitude - a.longitude) * radians
  const x = Math.sin(deltaLat / 2) ** 2
    + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(deltaLon / 2) ** 2
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(x)))
}

export function chooseOfferDecision(candidates: OfferCandidate[], quantity: number, price: number,
  excludedVendorIds: string[] = [], destination?: { postal_code?: string | null; latitude?: number | null; longitude?: number | null },
  draw: (max: number) => number = randomInt): OfferSelection {
  const eligible = candidates.filter(candidate => !excludedVendorIds.includes(candidate.vendor_id)
    && candidate.available >= quantity && candidate.prices.some(amount => Math.abs(amount - price) < 0.005))
  const postalCode = String(destination?.postal_code || "").trim()
  const coordinateReady = validCoordinate(destination?.latitude, destination?.longitude)
    && eligible.every(candidate => validCoordinate(candidate.latitude, candidate.longitude))
  const distances = eligible.map(candidate => ({ candidate,
    distance_km: coordinateReady ? haversineKm(
      { latitude: Number(destination!.latitude), longitude: Number(destination!.longitude) },
      { latitude: Number(candidate.latitude), longitude: Number(candidate.longitude) }) : null }))
  const audit = distances.map(({ candidate, distance_km }) => ({ vendor_id: candidate.vendor_id,
    variant_id: candidate.variant_id, available: candidate.available,
    distance_km: distance_km == null ? null : Math.round(distance_km * 100) / 100,
    store_pincode: candidate.store_pincode || null }))
  if (!eligible.length) return { selected: null, reason: "no_eligible", candidates: audit }
  if (eligible.length === 1) return { selected: eligible[0], reason: "only_eligible", candidates: audit }
  if (coordinateReady) {
    const nearest = Math.min(...distances.map(row => row.distance_km!))
    // Postal centroids are approximate. Differences under 5 km are ties.
    const tied = distances.filter(row => row.distance_km! - nearest <= 5)
    return { selected: tied[draw(tied.length)].candidate,
      reason: tied.length > 1 ? "equal_distance_random" : "nearest_postal_centroid", candidates: audit }
  }
  const samePostal = postalCode ? eligible.filter(candidate => candidate.store_pincode === postalCode) : []
  const tied = samePostal.length ? samePostal : eligible
  return { selected: tied[draw(tied.length)],
    reason: samePostal.length ? "same_postal_code" : "distance_unavailable_random", candidates: audit }
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
  return chooseOfferDecision(candidates, quantity, price, excludedVendorIds, undefined, draw).selected
}

/** Read the same public SKU across published offers, with real free inventory. */
async function queryCatalogOffers(variantId: string, sameSkuOnly: boolean): Promise<OfferCandidate[]> {
  const specialPriceListId = process.env.OWEG_SPECIAL_PRICE_LIST_ID || "pl_1765232034558"
  const { rows } = await getSharedDbPool().query<OfferCandidate>(`
    WITH origin AS (
      SELECT p.id AS product_id,
        COALESCE(NULLIF(p.metadata->>'catalog_product_id', ''), p.id) AS catalog_id,
        UPPER(BTRIM(COALESCE(p.metadata->'catalog_skus'->>v.sku, v.sku, ''))) AS public_sku
      FROM product_variant v JOIN product p ON p.id = v.product_id
      WHERE v.id = $1 AND v.deleted_at IS NULL AND p.deleted_at IS NULL
    )
    SELECT v.id AS variant_id, p.id AS product_id, p.metadata->>'vendor_id' AS vendor_id,
      p.title AS product_title, v.title AS variant_title,
      COALESCE(NULLIF(BTRIM(seller.store_name), ''), NULLIF(BTRIM(seller.name), ''), 'OWEG seller') AS store_name,
      seller.name AS vendor_name, seller.email AS vendor_email,
      seller.store_pincode, geo.latitude, geo.longitude,
      UPPER(BTRIM(COALESCE(p.metadata->'catalog_skus'->>v.sku, v.sku, ''))) AS sku,
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
            AND (COALESCE(pl.rules_count, 0) = 0 OR pl.id = $2) AND (pl.starts_at IS NULL OR pl.starts_at <= now())
            AND (pl.ends_at IS NULL OR pl.ends_at > now())))), ARRAY[]::numeric[]) AS prices
    FROM origin
    JOIN product p ON COALESCE(NULLIF(p.metadata->>'catalog_product_id', ''), p.id) = origin.catalog_id
      AND p.deleted_at IS NULL AND p.status = 'published'
      AND COALESCE(p.metadata->>'approval_status', 'approved') = 'approved'
      AND NULLIF(p.metadata->>'vendor_id', '') IS NOT NULL
    JOIN product_variant v ON v.product_id = p.id AND v.deleted_at IS NULL
    JOIN vendor seller ON seller.id = p.metadata->>'vendor_id' AND seller.deleted_at IS NULL AND seller.is_approved = true
    LEFT JOIN postal_location_cache geo ON geo.postal_code=seller.store_pincode
    WHERE ($3::boolean = false OR (origin.public_sku <> ''
      AND UPPER(BTRIM(COALESCE(p.metadata->'catalog_skus'->>v.sku, v.sku, ''))) = origin.public_sku))
  `, [variantId, specialPriceListId, sameSkuOnly])
  return rows.map(row => ({ ...row, available: Number(row.available), prices: (row.prices || []).map(Number),
    latitude: row.latitude == null ? null : Number(row.latitude), longitude: row.longitude == null ? null : Number(row.longitude) }))
}

/** Published variants of the same catalog product, including other colours and sizes. */
export async function listCatalogOffers(variantId: string): Promise<OfferCandidate[]> {
  return queryCatalogOffers(variantId, false)
}

/** Read the same public SKU across published offers, with real free inventory. */
export async function listSameSkuOffers(variantId: string): Promise<OfferCandidate[]> {
  return queryCatalogOffers(variantId, true)
}

export async function selectSameSkuOffer(variantId: string, quantity: number, price: number, excludedVendorIds: string[] = []) {
  if (!variantId || !Number.isSafeInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) return null
  return chooseOffer(await listSameSkuOffers(variantId), quantity, price, excludedVendorIds)
}

export async function selectSameSkuOfferWithDecision(variantId: string, quantity: number, price: number,
  destinationPostalCode: string, excludedVendorIds: string[] = []): Promise<OfferSelection> {
  if (!variantId || !Number.isSafeInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0)
    return { selected: null, reason: "no_eligible", candidates: [] }
  let destination: { postal_code: string; latitude?: number | null; longitude?: number | null } = { postal_code: destinationPostalCode }
  if (destinationPostalCode) {
    const location = await getSharedDbPool().query<{ latitude: number; longitude: number }>(
      "SELECT latitude,longitude FROM postal_location_cache WHERE postal_code=$1", [destinationPostalCode])
    if (location.rows[0]) destination = { ...destination,
      latitude: Number(location.rows[0].latitude), longitude: Number(location.rows[0].longitude) }
  }
  return chooseOfferDecision(await listSameSkuOffers(variantId), quantity, price, excludedVendorIds, destination)
}
