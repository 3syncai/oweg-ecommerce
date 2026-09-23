import {
  COMMISSION_RATE,
  DEFAULT_LOGISTICS_FEE,
  FEE_GST_RATE,
  LOGISTICS_GST_RATE,
  PARTNER_COMMISSION_RATE,
  PLATFORM_FEE_RATE,
  PRODUCT_GST_RATE,
  TCS_RATE,
  TDS_RATE,
} from "./pricingConfig"

/** One settlement row: Basic | GST/tax | Total */
export type MoneyRow = {
  basic: number
  gstOrTax: number
  total: number
}

export type VendorPricingResult = {
  item: MoneyRow
  logistics: MoneyRow
  listing: MoneyRow
  platformFee: MoneyRow
  commissionFee: MoneyRow
  partnerCommission: MoneyRow
  /** Logistics again on the deductions side (same amounts) */
  logisticsDeduction: MoneyRow
  tcs: MoneyRow
  tds: MoneyRow
  totalDeductions: MoneyRow
  /** Precise listing total (2 decimals) before whole-rupee display round */
  totalListingPrice: number
  /** Precise deductions total */
  totalDeductionsAmount: number
  /** Precise bank settlement */
  bankSettlement: number
  /** Excel-style whole-rupee summaries */
  totalListingPriceRounded: number
  totalDeductionsRounded: number
  bankSettlementRounded: number
}

function zeroRow(): MoneyRow {
  return { basic: 0, gstOrTax: 0, total: 0 }
}

const ZERO: VendorPricingResult = {
  item: zeroRow(),
  logistics: zeroRow(),
  listing: zeroRow(),
  platformFee: zeroRow(),
  commissionFee: zeroRow(),
  partnerCommission: zeroRow(),
  logisticsDeduction: zeroRow(),
  tcs: zeroRow(),
  tds: zeroRow(),
  totalDeductions: zeroRow(),
  totalListingPrice: 0,
  totalDeductionsAmount: 0,
  bankSettlement: 0,
  totalListingPriceRounded: 0,
  totalDeductionsRounded: 0,
  bankSettlementRounded: 0,
}

/** Round to 2 decimal places (paise). */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Whole rupees like Excel orange/blue summary cells. */
export function roundRupee(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

/** Indian Rupee formatting: ₹1,490.34 / ₹1,25,490.00 */
export function formatInr(value: number, fractionDigits = 2): string {
  const n = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n)
}

function rowFromBasic(basicInput: number, gstRatePct: number): MoneyRow {
  const basic = round2(Math.max(0, basicInput))
  const gstOrTax = round2((basic * gstRatePct) / 100)
  return { basic, gstOrTax, total: round2(basic + gstOrTax) }
}

/**
 * Vendor settlement estimate from Product Base Price + logistics basic.
 * Aligns with client "Vendor Product Settlement" Excel.
 */
export function calculateVendorPricing(
  basePriceInput: number,
  logisticsFeeInput: number = DEFAULT_LOGISTICS_FEE
): VendorPricingResult {
  const itemBasic =
    !Number.isFinite(basePriceInput) || basePriceInput <= 0 ? 0 : basePriceInput
  const logisticsBasic =
    !Number.isFinite(logisticsFeeInput) || logisticsFeeInput < 0
      ? 0
      : logisticsFeeInput

  if (itemBasic === 0) {
    return { ...ZERO }
  }

  // --- Listing price (A + B = C) ---
  const item = rowFromBasic(itemBasic, PRODUCT_GST_RATE)
  const logistics = rowFromBasic(logisticsBasic, LOGISTICS_GST_RATE)
  const listing: MoneyRow = {
    basic: round2(item.basic + logistics.basic),
    gstOrTax: round2(item.gstOrTax + logistics.gstOrTax),
    total: round2(item.total + logistics.total),
  }

  // --- Deductions ---
  // Platform & commission: % of item basic, then 18% input GST
  const platformFee = rowFromBasic(
    (item.basic * PLATFORM_FEE_RATE) / 100,
    FEE_GST_RATE
  )
  const commissionFee = rowFromBasic(
    (item.basic * COMMISSION_RATE) / 100,
    FEE_GST_RATE
  )
  // Partner: % of total listing price (C total), then 18% input GST
  const partnerCommission = rowFromBasic(
    (listing.total * PARTNER_COMMISSION_RATE) / 100,
    FEE_GST_RATE
  )
  const logisticsDeduction: MoneyRow = { ...logistics }

  // TCS / TDS: tax-only lines (basic 0)
  const tcsAmount = round2((item.basic * TCS_RATE) / 100)
  const tdsAmount = round2((item.basic * TDS_RATE) / 100)
  const tcs: MoneyRow = { basic: 0, gstOrTax: tcsAmount, total: tcsAmount }
  const tds: MoneyRow = { basic: 0, gstOrTax: tdsAmount, total: tdsAmount }

  const totalDeductions: MoneyRow = {
    basic: round2(
      platformFee.basic +
        commissionFee.basic +
        partnerCommission.basic +
        logisticsDeduction.basic +
        tcs.basic +
        tds.basic
    ),
    gstOrTax: round2(
      platformFee.gstOrTax +
        commissionFee.gstOrTax +
        partnerCommission.gstOrTax +
        logisticsDeduction.gstOrTax +
        tcs.gstOrTax +
        tds.gstOrTax
    ),
    total: round2(
      platformFee.total +
        commissionFee.total +
        partnerCommission.total +
        logisticsDeduction.total +
        tcs.total +
        tds.total
    ),
  }

  const totalListingPrice = listing.total
  const totalDeductionsAmount = totalDeductions.total
  const bankSettlement = round2(totalListingPrice - totalDeductionsAmount)

  const totalListingPriceRounded = roundRupee(totalListingPrice)
  const totalDeductionsRounded = roundRupee(totalDeductionsAmount)
  // Round the precise difference (not rounded−rounded) to match Excel ₹1,124
  const bankSettlementRounded = roundRupee(bankSettlement)

  return {
    item,
    logistics,
    listing,
    platformFee,
    commissionFee,
    partnerCommission,
    logisticsDeduction,
    tcs,
    tds,
    totalDeductions,
    totalListingPrice,
    totalDeductionsAmount,
    bankSettlement,
    totalListingPriceRounded,
    totalDeductionsRounded,
    bankSettlementRounded,
  }
}
