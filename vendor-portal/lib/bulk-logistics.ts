import { bulkPricingSignature, calculateBulkListing, resolveBulkListing, type BulkPricingDecision } from "./bulk-pricing"
import { getCalculatorProductPrice, round2 } from "./productPriceCalculator"
import { hasUsableShippingQuote, type ShippingEstimate } from "./shipping-estimate"
import type { ParsedRow } from "./bulk-upload"

// Leave time to build/send one product, rather than requiring the entire file to stay fresh.
export const BULK_QUOTE_MARGIN_MS = 60_000
type QuoteParams = { length: number; width: number; height: number; weight: number; declared_value: number; refresh: boolean }
export type BulkQuoteFetcher = (params: QuoteParams, signal?: AbortSignal) => Promise<ShippingEstimate>
export type BulkQuoteState = { signature: string; status: "loading" | "ready" | "error"; message?: string }

export function bulkQuoteFresh(row: ParsedRow, now = Date.now(), margin = BULK_QUOTE_MARGIN_MS): boolean {
  const d = row.listingPricing
  return Boolean(d?.signature === bulkPricingSignature(row) && hasUsableShippingQuote(d.shippingEstimate) &&
    Date.parse(d.shippingEstimate!.expires_at) > now + margin)
}

export function pricingFromBulkQuote(row: ParsedRow, quote: ShippingEstimate, now = Date.now()): BulkPricingDecision {
  if (!hasUsableShippingQuote(quote) || !(Date.parse(quote.expires_at) > now + BULK_QUOTE_MARGIN_MS))
    throw new Error("No fresh usable shipping quote is available. Retry logistics or contact support.")
  const signature = bulkPricingSignature(row)
  const previous = row.listingPricing?.signature === signature ? row.listingPricing : undefined
  const base = Number(getCalculatorProductPrice(row.price, row.discountedPrice))
  const { suggestedPrice } = calculateBulkListing(base, quote.freight_charge, Number(row.gstRate))
  const manual = previous && previous.listingPrice !== previous.suggestedPrice.toFixed(2)
  return {
    signature, logisticsFee: quote.freight_charge, shippingEstimate: quote,
    courierName: quote.courier_name, pickupPincode: quote.pickup_pincode, deliveryPincode: quote.delivery_pincode,
    suggestedPrice, listingPrice: manual ? previous.listingPrice : suggestedPrice.toFixed(2),
    requiresReview: Boolean(previous?.requiresReview || (previous &&
      (round2(previous.logisticsFee) !== round2(quote.freight_charge) || previous.suggestedPrice !== suggestedPrice))),
  }
}

/** Bounded, selective refresh. Failed requests are not cached; existing edits never get cleared. */
export async function refreshBulkLogistics(rows: ParsedRow[], estimate: BulkQuoteFetcher, options: {
  signal?: AbortSignal
  now?: () => number
  getRow?: (sku: string) => ParsedRow | undefined
  onDecision: (sku: string, decision: BulkPricingDecision) => void
  onState?: (sku: string, state: BulkQuoteState) => void
}) {
  const now = options.now || Date.now
  const queue = rows.filter(row => !row.errors.length && row.status !== "success" && !bulkQuoteFresh(row, now()))
  const requests = new Map<string, Promise<ShippingEstimate>>()
  let next = 0
  const failures: string[] = []
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (next < queue.length && !options.signal?.aborted) {
      const row = queue[next++]
      const signature = bulkPricingSignature(row)
      options.onState?.(row.sku, { signature, status: "loading" })
      try {
        for (const field of ["length", "width", "height", "weight"] as const)
          if (!Number.isFinite(Number(row[field])) || Number(row[field]) <= 0) throw new Error(`Enter a positive package ${field} in the Excel file`)
        const params = { length: Number(row.length), width: Number(row.width), height: Number(row.height), weight: Number(row.weight), declared_value: Number(row.price), refresh: Boolean(row.listingPricing) }
        const key = JSON.stringify(params)
        let request = requests.get(key)
        if (!request) { request = estimate(params, options.signal); requests.set(key, request) }
        let quote: ShippingEstimate
        try { quote = await request } catch (error) { requests.delete(key); throw error }
        // A shared result may itself have expired during a long-running queue.
        if (!(Date.parse(quote.expires_at) > now() + BULK_QUOTE_MARGIN_MS)) {
          requests.delete(key)
          quote = await estimate({ ...params, refresh: true }, options.signal)
        }
        if (options.signal?.aborted) return
        const latest = options.getRow ? options.getRow(row.sku) : row
        if (!latest || bulkPricingSignature(latest) !== signature) continue
        const decision = pricingFromBulkQuote(latest, quote, now())
        options.onDecision(row.sku, decision)
        options.onState?.(row.sku, { signature, status: "ready", message: decision.requiresReview ? "Shipping changed. Review the updated price before submitting." : "Shipping calculated" })
      } catch (error) {
        if (options.signal?.aborted) return
        const message = error instanceof Error ? error.message : "Logistics estimate failed"
        failures.push(`${row.sku}: ${message}`)
        options.onState?.(row.sku, { signature, status: "error", message })
      }
    }
  }))
  return failures
}

/** Refresh immediately before each product request, including all of its variants. */
export async function prepareBulkProduct(rows: ParsedRow[], estimate: BulkQuoteFetcher, onDecision: (sku: string, decision: BulkPricingDecision) => void, now: () => number = Date.now) {
  const updated = new Map(rows.map(row => [row.sku, row]))
  const failures = await refreshBulkLogistics(rows, estimate, { now, onDecision: (sku, decision) => {
    updated.set(sku, { ...updated.get(sku)!, listingPricing: decision })
    onDecision(sku, decision)
  } })
  if (failures.length) throw new Error(failures.join("; "))
  const prepared = rows.map(row => updated.get(row.sku)!)
  const needsReview = prepared.some(row => row.listingPricing?.requiresReview)
  if (!needsReview) for (const row of prepared) {
    if (!bulkQuoteFresh(row, now(), 0)) throw new Error(`Shipping quote expired for ${row.title}; retry this product`)
    resolveBulkListing(row)
  }
  return { rows: prepared, needsReview }
}
