/**
 * Marketplace settlement tax (Amazon / Flipkart style for Indian e-commerce).
 *
 * Flow (GST-inclusive catalog prices):
 *   1. Split inclusive → taxable + GST
 *   2. Commission on taxable
 *   3. GST TCS (s.52) on taxable — default 0.5%
 *   4. Income-tax TDS (s.194-O) on taxable — default 0.1%
 *   5. net = taxable − commission − TCS − TDS
 *
 * Shipping is out of the TCS/TDS base (v1). Rates are configurable via store.metadata.
 * Not legal advice — confirm rates with your CA.
 */

import type { Pool } from "pg"
import { breakdownInclusiveGst, parseGstRate } from "./gst-inclusive"

/** GST TCS under CGST s.52 — industry default after Jul 2024 cut (0.5% of taxable). */
export const DEFAULT_MARKETPLACE_TCS_RATE = 0.5

/** Income-tax TDS under s.194-O — industry default after Oct 2024 cut (0.1% of taxable). */
export const DEFAULT_MARKETPLACE_TDS_RATE = 0.1

export const VENDOR_TCS_RATE_METADATA_KEY = "vendor_marketplace_tcs_rate"
export const VENDOR_TDS_RATE_METADATA_KEY = "vendor_marketplace_tds_rate"

export type MarketplaceTaxRates = {
  tcs_rate: number
  tds_rate: number
}

export type MarketplaceSettlementInput = {
  /** GST-inclusive product sale amount (customer-facing line total). */
  inclusive_amount: number
  /** GST % for the supply (e.g. 18). */
  gst_rate: number
  commission_rate: number
  tcs_rate: number
  tds_rate: number
}

export type MarketplaceSettlementBreakdown = {
  inclusive_amount: number
  taxable_amount: number
  gst_amount: number
  gst_rate: number
  commission_rate: number
  commission_amount: number
  tcs_rate: number
  tcs_amount: number
  tds_rate: number
  tds_amount: number
  /** Amount credited to vendor after commission + TCS + TDS. */
  net_amount: number
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export function clampTaxRate(rate: unknown, fallback: number): number {
  const n = typeof rate === "string" ? Number(rate) : Number(rate)
  if (!Number.isFinite(n)) return fallback
  return Math.min(100, Math.max(0, n))
}

/**
 * Core marketplace settlement math (single inclusive amount + one GST rate).
 */
export function calculateMarketplaceSettlement(
  input: MarketplaceSettlementInput
): MarketplaceSettlementBreakdown {
  const inclusive = round2(Math.max(0, Number(input.inclusive_amount) || 0))
  const gstRate = Math.max(0, Number(input.gst_rate) || 0)
  const commissionRate = clampTaxRate(input.commission_rate, 0)
  const tcsRate = clampTaxRate(input.tcs_rate, DEFAULT_MARKETPLACE_TCS_RATE)
  const tdsRate = clampTaxRate(input.tds_rate, DEFAULT_MARKETPLACE_TDS_RATE)

  const gstSplit = breakdownInclusiveGst(inclusive, gstRate)
  const taxable = gstSplit.taxable
  const gstAmount = gstSplit.gst

  const commissionAmount = round2((taxable * commissionRate) / 100)
  const tcsAmount = round2((taxable * tcsRate) / 100)
  const tdsAmount = round2((taxable * tdsRate) / 100)
  const netAmount = round2(
    Math.max(0, taxable - commissionAmount - tcsAmount - tdsAmount)
  )

  return {
    inclusive_amount: inclusive,
    taxable_amount: taxable,
    gst_amount: gstAmount,
    gst_rate: gstRate,
    commission_rate: commissionRate,
    commission_amount: commissionAmount,
    tcs_rate: tcsRate,
    tcs_amount: tcsAmount,
    tds_rate: tdsRate,
    tds_amount: tdsAmount,
    net_amount: netAmount,
  }
}

/**
 * Aggregate settlement across line items that may have different GST rates.
 */
export function calculateMarketplaceSettlementFromLines(
  lines: Array<{ inclusive_amount: number; gst_rate: number }>,
  rates: {
    commission_rate: number
    tcs_rate: number
    tds_rate: number
  }
): MarketplaceSettlementBreakdown {
  let inclusive = 0
  let taxable = 0
  let gstAmount = 0
  let weightedRateNumerator = 0

  for (const line of lines) {
    const lineInclusive = round2(Math.max(0, Number(line.inclusive_amount) || 0))
    if (lineInclusive <= 0) continue
    const rate = Math.max(0, Number(line.gst_rate) || 0)
    const split = breakdownInclusiveGst(lineInclusive, rate)
    inclusive = round2(inclusive + split.inclusive)
    taxable = round2(taxable + split.taxable)
    gstAmount = round2(gstAmount + split.gst)
    weightedRateNumerator += split.taxable * rate
  }

  const effectiveGstRate =
    taxable > 0 ? round2(weightedRateNumerator / taxable) : 0

  const commissionRate = clampTaxRate(rates.commission_rate, 0)
  const tcsRate = clampTaxRate(rates.tcs_rate, DEFAULT_MARKETPLACE_TCS_RATE)
  const tdsRate = clampTaxRate(rates.tds_rate, DEFAULT_MARKETPLACE_TDS_RATE)
  const commissionAmount = round2((taxable * commissionRate) / 100)
  const tcsAmount = round2((taxable * tcsRate) / 100)
  const tdsAmount = round2((taxable * tdsRate) / 100)
  const netAmount = round2(
    Math.max(0, taxable - commissionAmount - tcsAmount - tdsAmount)
  )

  return {
    inclusive_amount: inclusive,
    taxable_amount: taxable,
    gst_amount: gstAmount,
    gst_rate: effectiveGstRate,
    commission_rate: commissionRate,
    commission_amount: commissionAmount,
    tcs_rate: tcsRate,
    tcs_amount: tcsAmount,
    tds_rate: tdsRate,
    tds_amount: tdsAmount,
    net_amount: netAmount,
  }
}

export function parseLineGstRate(raw: unknown): number {
  return parseGstRate(raw) ?? 0
}

async function readStoreMetadata(pool: Pool): Promise<Record<string, unknown>> {
  const result = await pool.query<{ metadata: Record<string, unknown> | null }>(
    `SELECT metadata FROM store ORDER BY created_at ASC NULLS LAST LIMIT 1`
  )
  return result.rows[0]?.metadata || {}
}

export async function getMarketplaceTaxRates(pool: Pool): Promise<MarketplaceTaxRates> {
  const meta = await readStoreMetadata(pool)
  return {
    tcs_rate: clampTaxRate(
      meta[VENDOR_TCS_RATE_METADATA_KEY],
      DEFAULT_MARKETPLACE_TCS_RATE
    ),
    tds_rate: clampTaxRate(
      meta[VENDOR_TDS_RATE_METADATA_KEY],
      DEFAULT_MARKETPLACE_TDS_RATE
    ),
  }
}

export async function setMarketplaceTaxRates(
  pool: Pool,
  input: Partial<MarketplaceTaxRates>
): Promise<MarketplaceTaxRates> {
  const existing = await pool.query<{
    id: string
    metadata: Record<string, unknown> | null
  }>(`SELECT id, metadata FROM store ORDER BY created_at ASC NULLS LAST LIMIT 1`)
  const row = existing.rows[0]
  if (!row) throw new Error("Store not found")

  const current = await getMarketplaceTaxRates(pool)
  const next: MarketplaceTaxRates = {
    tcs_rate:
      input.tcs_rate == null
        ? current.tcs_rate
        : clampTaxRate(input.tcs_rate, DEFAULT_MARKETPLACE_TCS_RATE),
    tds_rate:
      input.tds_rate == null
        ? current.tds_rate
        : clampTaxRate(input.tds_rate, DEFAULT_MARKETPLACE_TDS_RATE),
  }

  const metadata = {
    ...(row.metadata || {}),
    [VENDOR_TCS_RATE_METADATA_KEY]: next.tcs_rate,
    [VENDOR_TDS_RATE_METADATA_KEY]: next.tds_rate,
  }
  // Drop legacy no-PAN rate key if present
  delete (metadata as Record<string, unknown>).vendor_marketplace_tds_no_pan_rate

  await pool.query(
    `UPDATE store SET metadata = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(metadata), row.id]
  )

  return next
}
