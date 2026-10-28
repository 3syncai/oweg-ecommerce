import { calculateVendorPricing, getCalculatorProductPrice, round2 } from "./productPriceCalculator"
import type { ParsedRow } from "./bulk-upload"
import { hasUsableShippingQuote, type ShippingEstimate } from "./shipping-estimate"

export type BulkPricingDecision = {
  signature: string
  logisticsFee: number
  courierName?: string
  pickupPincode?: string
  deliveryPincode?: string
  suggestedPrice: number
  listingPrice: string
  shippingEstimate?: ShippingEstimate
  requiresReview?: boolean
}

export const bulkPricingSignature = (row: ParsedRow) =>
  JSON.stringify([row.price, row.discountedPrice, row.gstRate, row.taxCode, row.length, row.width, row.height, row.weight])

/** Base-price mode: add the existing calculator's fee/tax lines once to the Excel base price.
 * This is a cost build-up, not a reverse calculation targeting a guaranteed settlement.
 */
export function calculateBulkListing(base: number, logistics: number, gst: number) {
  if (!Number.isFinite(base) || base <= 0) throw new Error("Base price must be greater than zero")
  if (!Number.isFinite(logistics) || logistics < 0) throw new Error("A valid logistics estimate is required")
  if (!Number.isFinite(gst) || gst < 0) throw new Error("A valid product GST rate is required")
  const calculation = calculateVendorPricing(base, logistics, gst)
  return { base, calculation, suggestedPrice: round2(base + calculation.totalDeductionsAmount) }
}

export function resolveBulkListing(row: ParsedRow, options: { refreshExpiredBeforeSubmit?: boolean } = {}) {
  const decision = row.listingPricing
  if (!decision || decision.signature !== bulkPricingSignature(row)) throw new Error(`Calculate listing price for ${row.title} (${row.sku})`)
  if (!hasUsableShippingQuote(decision.shippingEstimate)) throw new Error(`No usable shipping quote for ${row.title}; refresh logistics or contact support for a shipping quote`)
  if (decision.requiresReview) throw new Error(`Review updated shipping and listing price for ${row.title} (${row.sku})`)
  if (decision.shippingEstimate && (!Number.isFinite(Date.parse(decision.shippingEstimate.expires_at)) || (!options.refreshExpiredBeforeSubmit && Date.parse(decision.shippingEstimate.expires_at) <= Date.now()))) throw new Error(`Shipping quote expired for ${row.title}; refresh logistics`)
  if (!/^\d+(?:\.\d{1,2})?$/.test(decision.listingPrice) || Number(decision.listingPrice) <= 0 || !Number.isSafeInteger(Math.round(Number(decision.listingPrice) * 100))) throw new Error(`Enter a valid listing price for ${row.title}`)
  const base = Number(getCalculatorProductPrice(row.price, row.discountedPrice))
  const { suggestedPrice } = calculateBulkListing(base, decision.logisticsFee, Number(row.gstRate))
  const listingPrice = Number(decision.listingPrice)
  const catalogueMrp = Math.max(listingPrice, calculateBulkListing(Number(row.price), decision.logisticsFee, Number(row.gstRate)).suggestedPrice)
  return { base, suggestedPrice, listingPrice, catalogueMrp, decision }
}

export function bulkPricingReady(row: ParsedRow): boolean {
  try { resolveBulkListing(row); return true } catch { return false }
}
