import {
  COMMISSION_RATE,
  DEFAULT_LOGISTICS_FEE,
  FEE_GST_RATE,
  LOGISTICS_GST_RATE,
  PARTNER_COMMISSION_RATE,
  PAYMENT_GATEWAY_RATE,
  PLATFORM_FEE_RATE,
  PRODUCT_GST_RATE,
  TCS_RATE,
  TDS_RATE,
} from "./pricingConfig"

/** Customer pays ₹50 (GST-inclusive) only when the cart/listing is below ₹500. */
export const CUSTOMER_SHIPPING_CHARGE = 50
export const CUSTOMER_SHIPPING_FREE_THRESHOLD = 500

/** One settlement row: Basic | GST/tax | Total */
export type MoneyRow = {
  basic: number
  gstOrTax: number
  total: number
}

export type VendorPricingResult = {
  item: MoneyRow
  logistics: MoneyRow
  /** Customer-paid low-cart shipping. GST is included in total. */
  customerShipping: MoneyRow
  listing: MoneyRow
  platformFee: MoneyRow
  commissionFee: MoneyRow
  partnerCommission: MoneyRow
  paymentGatewayFee: MoneyRow
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
  /** Total Input GST & Taxes on deductions */
  inputGstAndTaxes: number
  /** Final Settlement = Total Listing Price - Total Deductions + Input GST & Taxes */
  finalSettlement: number
  finalSettlementRounded: number
}

function zeroRow(): MoneyRow {
  return { basic: 0, gstOrTax: 0, total: 0 }
}

const ZERO: VendorPricingResult = {
  item: zeroRow(),
  logistics: zeroRow(),
  customerShipping: zeroRow(),
  listing: zeroRow(),
  platformFee: zeroRow(),
  commissionFee: zeroRow(),
  partnerCommission: zeroRow(),
  paymentGatewayFee: zeroRow(),
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
  inputGstAndTaxes: 0,
  finalSettlement: 0,
  finalSettlementRounded: 0,
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

/** Inclusive product price: back out basic and GST (e.g. 1360 at 12% -> basic 1214.29, GST 145.71) */
function rowFromInclusive(inclusiveInput: number, gstRatePct: number): MoneyRow {
  const total = round2(Math.max(0, inclusiveInput))
  const rate = Math.max(0, gstRatePct)
  const basic = round2(total / (1 + rate / 100))
  const gstOrTax = round2(total - basic)
  return { basic, gstOrTax, total }
}

/**
 * Vendor settlement estimate from inclusive Product Price + logistics basic.
 * Vendor enters all-inclusive product price; platform deducts dynamic GST to determine basic.
 */
export function calculateVendorPricing(
  productPriceInput: number,
  logisticsFeeInput: number = DEFAULT_LOGISTICS_FEE,
  productGstRateInput: number = PRODUCT_GST_RATE
): VendorPricingResult {
  const itemTotal =
    !Number.isFinite(productPriceInput) || productPriceInput <= 0 ? 0 : productPriceInput
  const logisticsBasic =
    !Number.isFinite(logisticsFeeInput) || logisticsFeeInput < 0
      ? 0
      : logisticsFeeInput

  if (itemTotal === 0) {
    return { ...ZERO }
  }

  const effectiveGstRate =
    Number.isFinite(productGstRateInput) && productGstRateInput >= 0
      ? productGstRateInput
      : PRODUCT_GST_RATE

  // --- Item pricing (inclusive of GST) ---
  const item = rowFromInclusive(itemTotal, effectiveGstRate)
  const logistics = rowFromBasic(logisticsBasic, LOGISTICS_GST_RATE)
  const customerShipping =
    itemTotal < CUSTOMER_SHIPPING_FREE_THRESHOLD
      ? rowFromInclusive(CUSTOMER_SHIPPING_CHARGE, LOGISTICS_GST_RATE)
      : zeroRow()
  const listing: MoneyRow = {
    basic: item.basic,
    gstOrTax: item.gstOrTax,
    total: item.total,
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
  // Partner: product listing only. Delivery logistics is never a fee base.
  const partnerCommission = rowFromBasic(
    (listing.total * PARTNER_COMMISSION_RATE) / 100,
    FEE_GST_RATE
  )
  const paymentGatewayFee = rowFromBasic(
    (item.total * PAYMENT_GATEWAY_RATE) / 100,
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
        paymentGatewayFee.basic +
        logisticsDeduction.basic +
        tcs.basic +
        tds.basic
    ),
    gstOrTax: round2(
      platformFee.gstOrTax +
        commissionFee.gstOrTax +
        partnerCommission.gstOrTax +
        paymentGatewayFee.gstOrTax +
        logisticsDeduction.gstOrTax +
        tcs.gstOrTax +
        tds.gstOrTax
    ),
    total: round2(
      platformFee.total +
        commissionFee.total +
        partnerCommission.total +
        paymentGatewayFee.total +
        logisticsDeduction.total +
        tcs.total +
        tds.total
    ),
  }

  const totalListingPrice = listing.total
  const totalDeductionsAmount = totalDeductions.total
  // Customer shipping is GST-inclusive; credit only its pre-GST amount.
  const bankSettlement = round2(
    totalListingPrice - totalDeductionsAmount + customerShipping.basic
  )

  // Input GST & Taxes = total GST/tax on deductions lines
  const inputGstAndTaxes = totalDeductions.gstOrTax
  // Final Settlement = Total Listing Price - Total Deductions + Input GST & Taxes
  const finalSettlement = round2(bankSettlement + inputGstAndTaxes)

  const totalListingPriceRounded = roundRupee(totalListingPrice)
  const totalDeductionsRounded = roundRupee(totalDeductionsAmount)
  // Round the precise difference (not rounded−rounded) to match Excel ₹1,124
  const bankSettlementRounded = roundRupee(bankSettlement)
  const finalSettlementRounded = roundRupee(finalSettlement)

  return {
    item,
    logistics,
    customerShipping,
    listing,
    platformFee,
    commissionFee,
    partnerCommission,
    paymentGatewayFee,
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
    inputGstAndTaxes,
    finalSettlement,
    finalSettlementRounded,
  }
}
