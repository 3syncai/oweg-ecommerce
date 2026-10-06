import type { LedgerRates } from "../vendor-ledger-settlement"

/** Default Sheet4 rates used by OWEG production. */
export const DEFAULT_LEDGER_RATES: LedgerRates = {
  platform_rate: 5,
  commission_rate: 2,
  partner_rate: 11,
  output_gst_rate: 18,
  service_gst_rate: 18,
  tcs_rate: 0.5,
  tds_rate: 0.1,
}

export const TAX_RATES = { tcs_rate: 0.5, tds_rate: 0.1 }

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

const pct = (base: number, rate: number) => r2(((Number(base) || 0) * rate) / 100)

/**
 * Independent Sheet4 expected math — not imported from the engine.
 * Tests fail if the production engine drifts from finance formulas.
 */
export function expectedSheet4(input: {
  sign: 1 | -1
  item_price: number
  logistic_fee: number
  rates?: LedgerRates
  reverse_logistic_fee?: number
  cancellation_fee?: number
}) {
  const rates = input.rates || DEFAULT_LEDGER_RATES
  const A = r2(Math.abs(input.item_price) * input.sign)
  const B = r2(Math.abs(input.logistic_fee) * input.sign)
  const listing_gst = r2(pct(A, rates.output_gst_rate) + pct(B, rates.service_gst_rate))
  const listing_total = r2(A + B + listing_gst)
  const platform_fee = pct(A, rates.platform_rate)
  const platform_gst = pct(platform_fee, rates.service_gst_rate)
  const platform_total = r2(platform_fee + platform_gst)
  const commission_fee = pct(A, rates.commission_rate)
  const commission_gst = pct(commission_fee, rates.service_gst_rate)
  const commission_total = r2(commission_fee + commission_gst)
  const partner_commission = pct(listing_total, rates.partner_rate)
  const partner_gst = pct(partner_commission, rates.service_gst_rate)
  const partner_total = r2(partner_commission + partner_gst)
  const logistic_gst = pct(B, rates.service_gst_rate)
  const logistic_total = r2(B + logistic_gst)
  const tcs = pct(A, rates.tcs_rate)
  const tds = pct(A, rates.tds_rate)
  let bank_settlement = r2(
    listing_total - platform_total - commission_total - partner_total - logistic_total - tcs - tds
  )
  const reverse_fee = r2(Math.abs(input.reverse_logistic_fee || 0))
  const reverse_gst = pct(reverse_fee, rates.service_gst_rate)
  const reverse_total = r2(reverse_fee + reverse_gst)
  const cancel_fee = r2(Math.abs(input.cancellation_fee || 0))
  const cancel_gst = pct(cancel_fee, rates.service_gst_rate)
  const cancel_total = r2(cancel_fee + cancel_gst)

  // Product reverse must not refund forward shipping — vendor still pays B + GST.
  let displayB = B
  let displayLogisticGst = logistic_gst
  let displayLogisticTotal = logistic_total
  if (input.sign === -1 && Math.abs(A) > 0.0001) {
    bank_settlement = r2(bank_settlement + logistic_total)
    displayB = 0
    displayLogisticGst = 0
    displayLogisticTotal = 0
  }

  return {
    A,
    B: displayB,
    listing_gst,
    listing_total,
    platform_fee,
    platform_gst,
    platform_total,
    commission_fee,
    commission_gst,
    commission_total,
    partner_commission,
    partner_gst,
    partner_total,
    logistic_gst: displayLogisticGst,
    logistic_total: displayLogisticTotal,
    tcs,
    tds,
    bank_settlement,
    reverse_fee,
    reverse_gst,
    reverse_total,
    cancel_fee,
    cancel_gst,
    cancel_total,
    balance_delta: r2(bank_settlement - reverse_total - cancel_total),
  }
}

/** Hand-locked ₹1000 + ₹50 Easy Ship @ default rates. Do not derive from the engine. */
export const LOCKED_SALE_1000_50 = {
  item_price: 1000,
  logistic_fee: 50,
  listing_gst: 189,
  listing_total: 1239,
  platform_fee: 50,
  platform_gst: 9,
  platform_total: 59,
  commission_fee: 20,
  commission_gst: 3.6,
  commission_total: 23.6,
  partner_commission: 136.29,
  partner_gst: 24.53,
  partner_total: 160.82,
  logistic_gst: 9,
  logistic_total: 59,
  tcs: 5,
  tds: 1,
  bank_settlement: 930.58,
}

export const LOCKED_SELF_SHIP_1000 = {
  item_price: 1000,
  logistic_fee: 0,
  listing_gst: 180,
  listing_total: 1180,
  bank_settlement: 938.24,
}

export const LOCKED_GST5_1000 = {
  item_price: 1000,
  logistic_fee: 0,
  listing_gst: 50,
  listing_total: 1050,
  bank_settlement: 825.11,
}
