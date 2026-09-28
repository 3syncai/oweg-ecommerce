/**
 * OWEG vendor product settlement (finance Sheet4).
 *
 *   GST (A+B) = (A + B) * output GST%
 *   C         = A + B + GST(A+B)
 *   D         = A * platform%   + 18% service GST
 *   E         = A * commission% + 18% service GST
 *   F         = C * partner%    + 18% service GST
 *   B_deduct  = B + B * 18%
 *   G         = A * TCS%
 *   H         = A * TDS%
 *   Bank (I)  = C − (Dtot + Etot + Ftot + B_deduct + G + H)
 *   Balance   += I − reverse_tot − cancel_tot + claim
 *   Payment   += −payout
 */

import type { Pool } from "pg"
import { clampTaxRate } from "./vendor-marketplace-tax"

export const DEFAULT_PLATFORM_FEE_RATE = 5
export const DEFAULT_PARTNER_COMMISSION_RATE = 11
export const DEFAULT_SERVICE_GST_RATE = 18
export const DEFAULT_OUTPUT_GST_RATE = 18

export const VENDOR_PLATFORM_FEE_METADATA_KEY = "vendor_platform_fee_default_rate"
export const VENDOR_PARTNER_COMMISSION_METADATA_KEY = "vendor_partner_commission_rate"
export const VENDOR_SERVICE_GST_METADATA_KEY = "vendor_service_gst_rate"

export type LedgerCategory = "sale" | "return" | "payment" | "claim" | "cancellation"

export type LedgerRates = {
  platform_rate: number
  commission_rate: number
  partner_rate: number
  output_gst_rate: number
  service_gst_rate: number
  tcs_rate: number
  tds_rate: number
}

export type LedgerSettlementInput = {
  category: LedgerCategory
  item_price: number
  logistic_fee: number
  reverse_logistic_fee?: number
  cancellation_fee?: number
  claim_amount?: number
  payment_amount?: number
  rates: LedgerRates
}

export type LedgerSettlementBreakdown = {
  category: LedgerCategory
  item_price: number
  logistic_fee: number
  listing_gst: number
  listing_total: number
  platform_rate: number
  platform_fee: number
  platform_gst: number
  platform_total: number
  commission_rate: number
  commission_fee: number
  commission_gst: number
  commission_total: number
  partner_rate: number
  partner_commission: number
  partner_gst: number
  partner_total: number
  logistic_gst: number
  logistic_total: number
  tcs: number
  tds: number
  bank_settlement: number
  reverse_logistic_fee: number
  reverse_logistic_gst: number
  reverse_logistic_total: number
  cancellation_fee: number
  cancellation_gst: number
  cancellation_total: number
  claim_amount: number
  payment: number
  balance_delta: number
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

const pct = (base: number, rate: number) =>
  round2(((Number(base) || 0) * (Number(rate) || 0)) / 100)

export function clampLedgerRate(rate: unknown, fallback: number): number {
  return clampTaxRate(rate, fallback)
}

function signedFeeBlock(base: number, serviceGstRate: number) {
  const fee = round2(base)
  const tax = pct(fee, serviceGstRate)
  return { fee, tax, total: round2(fee + tax) }
}

export function calculateVendorLedgerSettlement(
  input: LedgerSettlementInput
): LedgerSettlementBreakdown {
  const category = input.category
  const rates = input.rates
  const serviceGst = clampLedgerRate(rates.service_gst_rate, DEFAULT_SERVICE_GST_RATE)
  const outputGst = clampLedgerRate(rates.output_gst_rate, DEFAULT_OUTPUT_GST_RATE)

  if (category === "claim") {
    const claim = round2(Math.max(0, Number(input.claim_amount) || 0))
    return emptyBreakdown({
      category,
      claim_amount: claim,
      bank_settlement: claim,
      balance_delta: claim,
      rates,
    })
  }

  if (category === "payment") {
    const payment = round2(-Math.abs(Number(input.payment_amount) || 0))
    return emptyBreakdown({
      category,
      payment,
      bank_settlement: 0,
      balance_delta: payment,
      rates,
    })
  }

  const sign = category === "return" || category === "cancellation" ? -1 : 1
  const A = round2(Math.abs(Number(input.item_price) || 0) * sign)
  const B = round2(Math.abs(Number(input.logistic_fee) || 0) * sign)

  const listingGst = pct(A + B, outputGst)
  const listingTotal = round2(A + B + listingGst)

  const platformFee = pct(A, rates.platform_rate)
  const platformGst = pct(platformFee, serviceGst)
  const platformTotal = round2(platformFee + platformGst)

  const commissionFee = pct(A, rates.commission_rate)
  const commissionGst = pct(commissionFee, serviceGst)
  const commissionTotal = round2(commissionFee + commissionGst)

  const partnerCommission = pct(listingTotal, rates.partner_rate)
  const partnerGst = pct(partnerCommission, serviceGst)
  const partnerTotal = round2(partnerCommission + partnerGst)

  const logisticGst = pct(B, serviceGst)
  const logisticTotal = round2(B + logisticGst)

  const tcs = pct(A, rates.tcs_rate)
  const tds = pct(A, rates.tds_rate)

  const bank = round2(
    listingTotal - platformTotal - commissionTotal - partnerTotal - logisticTotal - tcs - tds
  )

  const reverse = signedFeeBlock(
    category === "return" || category === "cancellation"
      ? Math.abs(Number(input.reverse_logistic_fee) || 0)
      : 0,
    serviceGst
  )
  const cancel = signedFeeBlock(
    category === "return" || category === "cancellation"
      ? Math.abs(Number(input.cancellation_fee) || 0)
      : 0,
    serviceGst
  )

  return {
    category,
    item_price: A,
    logistic_fee: B,
    listing_gst: listingGst,
    listing_total: listingTotal,
    platform_rate: rates.platform_rate,
    platform_fee: platformFee,
    platform_gst: platformGst,
    platform_total: platformTotal,
    commission_rate: rates.commission_rate,
    commission_fee: commissionFee,
    commission_gst: commissionGst,
    commission_total: commissionTotal,
    partner_rate: rates.partner_rate,
    partner_commission: partnerCommission,
    partner_gst: partnerGst,
    partner_total: partnerTotal,
    logistic_gst: logisticGst,
    logistic_total: logisticTotal,
    tcs,
    tds,
    bank_settlement: bank,
    reverse_logistic_fee: reverse.fee,
    reverse_logistic_gst: reverse.tax,
    reverse_logistic_total: reverse.total,
    cancellation_fee: cancel.fee,
    cancellation_gst: cancel.tax,
    cancellation_total: cancel.total,
    claim_amount: 0,
    payment: 0,
    balance_delta: round2(bank - reverse.total - cancel.total),
  }
}

function emptyBreakdown(opts: {
  category: LedgerCategory
  rates: LedgerRates
  claim_amount?: number
  payment?: number
  bank_settlement?: number
  balance_delta?: number
}): LedgerSettlementBreakdown {
  return {
    category: opts.category,
    item_price: 0,
    logistic_fee: 0,
    listing_gst: 0,
    listing_total: 0,
    platform_rate: opts.rates.platform_rate,
    platform_fee: 0,
    platform_gst: 0,
    platform_total: 0,
    commission_rate: opts.rates.commission_rate,
    commission_fee: 0,
    commission_gst: 0,
    commission_total: 0,
    partner_rate: opts.rates.partner_rate,
    partner_commission: 0,
    partner_gst: 0,
    partner_total: 0,
    logistic_gst: 0,
    logistic_total: 0,
    tcs: 0,
    tds: 0,
    bank_settlement: opts.bank_settlement || 0,
    reverse_logistic_fee: 0,
    reverse_logistic_gst: 0,
    reverse_logistic_total: 0,
    cancellation_fee: 0,
    cancellation_gst: 0,
    cancellation_total: 0,
    claim_amount: opts.claim_amount || 0,
    payment: opts.payment || 0,
    balance_delta: opts.balance_delta || 0,
  }
}

export type StoreLedgerFeeRates = {
  platform_rate: number
  partner_rate: number
  service_gst_rate: number
}

export async function getStoreLedgerFeeRates(pool: Pool): Promise<StoreLedgerFeeRates> {
  const result = await pool.query<{ metadata: Record<string, unknown> | null }>(
    `SELECT metadata FROM store ORDER BY created_at ASC NULLS LAST LIMIT 1`
  )
  const meta = result.rows[0]?.metadata || {}
  return {
    platform_rate: clampLedgerRate(
      meta[VENDOR_PLATFORM_FEE_METADATA_KEY],
      DEFAULT_PLATFORM_FEE_RATE
    ),
    partner_rate: clampLedgerRate(
      meta[VENDOR_PARTNER_COMMISSION_METADATA_KEY],
      DEFAULT_PARTNER_COMMISSION_RATE
    ),
    service_gst_rate: clampLedgerRate(
      meta[VENDOR_SERVICE_GST_METADATA_KEY],
      DEFAULT_SERVICE_GST_RATE
    ),
  }
}

export function resolveVendorPlatformFeeRate(
  vendor: { platform_fee_override?: boolean | null; platform_fee_rate?: number | null },
  globalDefault: number
): { rate: number; source: "custom" | "global" } {
  if (vendor.platform_fee_override === true) {
    return {
      rate: clampLedgerRate(vendor.platform_fee_rate, DEFAULT_PLATFORM_FEE_RATE),
      source: "custom",
    }
  }
  return {
    rate: clampLedgerRate(globalDefault, DEFAULT_PLATFORM_FEE_RATE),
    source: "global",
  }
}

export async function getVendorPlatformFeeDefaultRate(pool: Pool): Promise<number> {
  const rates = await getStoreLedgerFeeRates(pool)
  return rates.platform_rate
}

export async function setVendorPlatformFeeDefaultRate(
  pool: Pool,
  rate: number
): Promise<number> {
  const next = clampLedgerRate(rate, DEFAULT_PLATFORM_FEE_RATE)
  const existing = await pool.query<{ id: string; metadata: Record<string, unknown> | null }>(
    `SELECT id, metadata FROM store ORDER BY created_at ASC NULLS LAST LIMIT 1`
  )
  const row = existing.rows[0]
  if (!row) throw new Error("Store not found")
  const metadata = {
    ...(row.metadata || {}),
    [VENDOR_PLATFORM_FEE_METADATA_KEY]: next,
  }
  await pool.query(
    `UPDATE store SET metadata = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(metadata), row.id]
  )
  return next
}

export async function fetchResolvedVendorPlatformFee(
  vendorId: string,
  pool: Pool
): Promise<number> {
  await ensureVendorPlatformFeeColumns(pool)
  const [vendor, globalDefault] = await Promise.all([
    pool.query<{
      platform_fee_rate: string | number | null
      platform_fee_override: boolean | null
    }>(
      `SELECT platform_fee_rate, platform_fee_override FROM vendor WHERE id = $1 LIMIT 1`,
      [vendorId]
    ),
    getVendorPlatformFeeDefaultRate(pool),
  ])
  const row = vendor.rows[0]
  return resolveVendorPlatformFeeRate(
    {
      platform_fee_rate:
        row?.platform_fee_rate == null ? null : Number(row.platform_fee_rate),
      platform_fee_override: row?.platform_fee_override === true,
    },
    globalDefault
  ).rate
}

let platformFeeColumnsReady: Promise<void> | null = null

export async function ensureVendorPlatformFeeColumns(pool: Pool): Promise<void> {
  if (!platformFeeColumnsReady) {
    platformFeeColumnsReady = pool
      .query(
        `
          ALTER TABLE vendor
            ADD COLUMN IF NOT EXISTS platform_fee_rate numeric NOT NULL DEFAULT 5,
            ADD COLUMN IF NOT EXISTS platform_fee_override boolean NOT NULL DEFAULT false
        `
      )
      .then(() => undefined)
      .catch((error) => {
        platformFeeColumnsReady = null
        throw error
      })
  }
  await platformFeeColumnsReady
}

export async function buildLedgerRatesForVendor(
  vendorId: string,
  pool: Pool,
  extras: {
    commission_rate: number
    tcs_rate: number
    tds_rate: number
    output_gst_rate?: number
    platform_rate?: number
  }
): Promise<LedgerRates> {
  const storeRates = await getStoreLedgerFeeRates(pool)
  const platformRate =
    extras.platform_rate != null
      ? clampLedgerRate(extras.platform_rate, storeRates.platform_rate)
      : await fetchResolvedVendorPlatformFee(vendorId, pool)

  return {
    platform_rate: platformRate,
    commission_rate: extras.commission_rate,
    partner_rate: storeRates.partner_rate,
    output_gst_rate: extras.output_gst_rate ?? DEFAULT_OUTPUT_GST_RATE,
    service_gst_rate: storeRates.service_gst_rate,
    tcs_rate: extras.tcs_rate,
    tds_rate: extras.tds_rate,
  }
}
