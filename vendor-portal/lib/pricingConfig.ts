/**
 * Platform pricing configuration for the vendor Product Price Calculator.
 * Vendors can edit logistics fee only; rates stay platform-controlled.
 * Swap for admin/backend fetch later.
 */

/** Default logistics basic (₹) — vendor-editable in the calculator UI */
export const DEFAULT_LOGISTICS_FEE = 90

export const PRODUCT_GST_RATE = 18
export const LOGISTICS_GST_RATE = 18
/** GST on platform / commission / partner / gateway / logistics deduction lines */
export const FEE_GST_RATE = 18

/** % of item price basic */
export const PLATFORM_FEE_RATE = 5
export const COMMISSION_RATE = 2

/**
 * Illustrative partner % for the price calculator only.
 * Live vendor deductions use the NH catalog rate frozen on each order
 * (0 when the product had no commission at order time).
 */
export const PARTNER_COMMISSION_RATE = 0
export const PAYMENT_GATEWAY_RATE = 2

/** % of item price basic (shown under taxes column) */
export const TCS_RATE = 0.5
export const TDS_RATE = 0.1
