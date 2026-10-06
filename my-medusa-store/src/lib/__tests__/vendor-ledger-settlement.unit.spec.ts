import {
  adminPayableNetFromLedger,
  calculateVendorLedgerSettlement,
  clampLedgerRate,
  clampRupeeAmount,
  overlaySaleDeductions,
  resolveVendorCancellationCharge,
  resolveVendorPlatformFeeRate,
  type LedgerRates,
} from "../vendor-ledger-settlement"
import {
  resolveVendorLogisticFee,
  resolveVendorReturnFee,
} from "../vendor-earnings"
import { calculateMarketplaceSettlement } from "../vendor-marketplace-tax"
import {
  DEFAULT_LEDGER_RATES,
  expectedSheet4,
  LOCKED_GST5_1000,
  LOCKED_SALE_1000_50,
  LOCKED_SELF_SHIP_1000,
  r2,
} from "./ledger-test-fixtures"

const settle = (
  category: "sale" | "return" | "cancellation" | "claim" | "payment",
  extra: {
    item_price?: number
    logistic_fee?: number
    reverse_logistic_fee?: number
    cancellation_fee?: number
    claim_amount?: number
    payment_amount?: number
    rates?: LedgerRates
  } = {}
) =>
  calculateVendorLedgerSettlement({
    category,
    item_price: extra.item_price ?? 0,
    logistic_fee: extra.logistic_fee ?? 0,
    reverse_logistic_fee: extra.reverse_logistic_fee,
    cancellation_fee: extra.cancellation_fee,
    claim_amount: extra.claim_amount,
    payment_amount: extra.payment_amount,
    rates: extra.rates || DEFAULT_LEDGER_RATES,
  })

describe("Sheet4 sale — locked finance fixtures", () => {
  it("₹1000 taxable + ₹50 Easy Ship @ default rates = bank 930.58", () => {
    const row = settle("sale", {
      item_price: LOCKED_SALE_1000_50.item_price,
      logistic_fee: LOCKED_SALE_1000_50.logistic_fee,
    })
    expect(row.listing_gst).toBe(LOCKED_SALE_1000_50.listing_gst)
    expect(row.listing_total).toBe(LOCKED_SALE_1000_50.listing_total)
    expect(row.platform_total).toBe(LOCKED_SALE_1000_50.platform_total)
    expect(row.commission_total).toBe(LOCKED_SALE_1000_50.commission_total)
    expect(row.partner_total).toBe(LOCKED_SALE_1000_50.partner_total)
    expect(row.logistic_total).toBe(LOCKED_SALE_1000_50.logistic_total)
    expect(row.tcs).toBe(LOCKED_SALE_1000_50.tcs)
    expect(row.tds).toBe(LOCKED_SALE_1000_50.tds)
    expect(row.bank_settlement).toBe(LOCKED_SALE_1000_50.bank_settlement)
    expect(row.balance_delta).toBe(LOCKED_SALE_1000_50.bank_settlement)
    expect(row.reverse_logistic_total).toBe(0)
    expect(row.cancellation_total).toBe(0)
    expect(row.payment).toBe(0)
    expect(row.claim_amount).toBe(0)
  })

  it("self-ship (B=0) keeps logistic deduction at 0 and bank 938.24", () => {
    const row = settle("sale", { item_price: 1000, logistic_fee: 0 })
    expect(row.logistic_fee).toBe(0)
    expect(row.logistic_total).toBe(0)
    expect(row.listing_total).toBe(LOCKED_SELF_SHIP_1000.listing_total)
    expect(row.bank_settlement).toBe(LOCKED_SELF_SHIP_1000.bank_settlement)
  })

  it("5% output GST product uses 5% on A; B stays 18%", () => {
    const row = settle("sale", {
      item_price: 1000,
      logistic_fee: 0,
      rates: { ...DEFAULT_LEDGER_RATES, output_gst_rate: 5 },
    })
    expect(row.listing_gst).toBe(LOCKED_GST5_1000.listing_gst)
    expect(row.listing_total).toBe(LOCKED_GST5_1000.listing_total)
    expect(row.bank_settlement).toBe(LOCKED_GST5_1000.bank_settlement)
  })

  it("INV-1111 style: 12% on A, always 18% on B", () => {
    const row = settle("sale", {
      item_price: 1214.29,
      logistic_fee: 35,
      rates: { ...DEFAULT_LEDGER_RATES, output_gst_rate: 12 },
    })
    expect(row.listing_gst).toBe(152.01)
    expect(row.listing_total).toBe(1401.3)
    expect(row.logistic_gst).toBe(6.3)
  })

  it("custom platform offer 3% changes D only and lifts bank by 23.60", () => {
    const global = settle("sale", { item_price: 1000, logistic_fee: 50 })
    const offer = settle("sale", {
      item_price: 1000,
      logistic_fee: 50,
      rates: { ...DEFAULT_LEDGER_RATES, platform_rate: 3 },
    })
    expect(offer.platform_total).toBe(35.4)
    expect(offer.commission_total).toBe(global.commission_total)
    expect(offer.partner_total).toBe(global.partner_total)
    expect(offer.bank_settlement).toBe(r2(global.bank_settlement + 23.6))
  })
})

describe("Sheet4 engine matches independent expected math", () => {
  const cases: Array<{
    name: string
    category: "sale" | "return" | "cancellation"
    item: number
    logistic: number
    reverse?: number
    cancel?: number
    rates?: LedgerRates
  }> = [
    { name: "normal easy-ship sale", category: "sale", item: 1000, logistic: 50 },
    { name: "self-ship sale", category: "sale", item: 847.46, logistic: 0 },
    { name: "paisa sale", category: "sale", item: 0.01, logistic: 0 },
    { name: "large sale", category: "sale", item: 99999.99, logistic: 499.99 },
    { name: "12% GST sale", category: "sale", item: 500, logistic: 40, rates: { ...DEFAULT_LEDGER_RATES, output_gst_rate: 12 } },
    { name: "0% GST sale", category: "sale", item: 200, logistic: 20, rates: { ...DEFAULT_LEDGER_RATES, output_gst_rate: 0 } },
    { name: "zero-fee rates", category: "sale", item: 1000, logistic: 50, rates: { ...DEFAULT_LEDGER_RATES, platform_rate: 0, commission_rate: 0, partner_rate: 0, tcs_rate: 0, tds_rate: 0 } },
    { name: "full return + reverse courier", category: "return", item: 1000, logistic: 50, reverse: 80 },
    { name: "return without reverse courier", category: "return", item: 1000, logistic: 50, reverse: 0 },
    { name: "cancellation + cancel fee", category: "cancellation", item: 1000, logistic: 50, cancel: 25 },
    { name: "cancellation + reverse + cancel", category: "cancellation", item: 400, logistic: 30, reverse: 60, cancel: 15 },
  ]

  it.each(cases)("$name", ({ category, item, logistic, reverse, cancel, rates }) => {
    const sign = category === "sale" ? 1 : -1
    const expected = expectedSheet4({
      sign,
      item_price: item,
      logistic_fee: logistic,
      reverse_logistic_fee: reverse,
      cancellation_fee: cancel,
      rates,
    })
    const row = settle(category, {
      item_price: item,
      logistic_fee: logistic,
      reverse_logistic_fee: reverse,
      cancellation_fee: cancel,
      rates,
    })
    expect(row.item_price).toBe(expected.A)
    expect(row.logistic_fee).toBe(expected.B)
    expect(row.listing_gst).toBe(expected.listing_gst)
    expect(row.listing_total).toBe(expected.listing_total)
    expect(row.platform_total).toBe(expected.platform_total)
    expect(row.commission_total).toBe(expected.commission_total)
    expect(row.partner_total).toBe(expected.partner_total)
    expect(row.logistic_total).toBe(expected.logistic_total)
    expect(row.tcs).toBe(expected.tcs)
    expect(row.tds).toBe(expected.tds)
    expect(row.bank_settlement).toBe(expected.bank_settlement)
    expect(row.reverse_logistic_total).toBe(expected.reverse_total)
    expect(row.cancellation_total).toBe(expected.cancel_total)
    expect(row.balance_delta).toBe(expected.balance_delta)
  })
})

describe("return / cancel identities", () => {
  it("sale + matching return (no reverse) nets to 0", () => {
    const sale = settle("sale", { item_price: 1000, logistic_fee: 50 })
    const ret = settle("return", { item_price: 1000, logistic_fee: 50 })
    expect(r2(sale.bank_settlement + ret.bank_settlement)).toBe(0)
    expect(r2(sale.listing_total + ret.listing_total)).toBe(0)
    expect(r2(sale.platform_total + ret.platform_total)).toBe(0)
    expect(r2(sale.tcs + ret.tcs)).toBe(0)
    expect(r2(sale.balance_delta + ret.balance_delta)).toBe(0)
  })

  it("sale + return with reverse courier nets to −reverse total only", () => {
    const sale = settle("sale", { item_price: 1000, logistic_fee: 50 })
    const ret = settle("return", {
      item_price: 1000,
      logistic_fee: 50,
      reverse_logistic_fee: 80,
    })
    expect(ret.reverse_logistic_total).toBe(94.4)
    expect(r2(sale.balance_delta + ret.balance_delta)).toBe(-94.4)
    expect(r2(sale.bank_settlement + ret.bank_settlement)).toBe(0)
  })

  it("cancelled order mirrors return for A/B and deducts cancel fee+18%", () => {
    const ret = settle("return", {
      item_price: 600,
      logistic_fee: 40,
      cancellation_fee: 20,
    })
    const cancel = settle("cancellation", {
      item_price: 600,
      logistic_fee: 40,
      cancellation_fee: 20,
    })
    expect(cancel.item_price).toBe(ret.item_price)
    expect(cancel.bank_settlement).toBe(ret.bank_settlement)
    expect(cancel.cancellation_total).toBe(23.6)
    expect(cancel.balance_delta).toBe(ret.balance_delta)
  })

  it("return does not apply reverse/cancel fees on a sale category row", () => {
    const sale = settle("sale", {
      item_price: 1000,
      logistic_fee: 50,
      reverse_logistic_fee: 80,
      cancellation_fee: 20,
    })
    expect(sale.reverse_logistic_total).toBe(0)
    expect(sale.cancellation_total).toBe(0)
    expect(sale.bank_settlement).toBe(LOCKED_SALE_1000_50.bank_settlement)
  })
})

describe("overlaySaleDeductions — unpaid sale with courier hold", () => {
  it("keeps bank I intact and subtracts reverse+GST from balance / admin pay", () => {
    const sale = settle("sale", { item_price: 1000, logistic_fee: 50 })
    const overlaid = overlaySaleDeductions(
      sale,
      { reverse_logistic_fee: 80 },
      DEFAULT_LEDGER_RATES
    )
    expect(overlaid.bank_settlement).toBe(sale.bank_settlement)
    expect(overlaid.item_price).toBe(1000)
    expect(overlaid.reverse_logistic_total).toBe(94.4)
    expect(overlaid.balance_delta).toBe(r2(sale.bank_settlement - 94.4))
    expect(adminPayableNetFromLedger(overlaid)).toBe(overlaid.balance_delta)
  })

  it("also overlays cancellation fee without reversing A/B", () => {
    const sale = settle("sale", { item_price: 1000, logistic_fee: 50 })
    const overlaid = overlaySaleDeductions(
      sale,
      { reverse_logistic_fee: 80, cancellation_fee: 20 },
      DEFAULT_LEDGER_RATES
    )
    expect(overlaid.item_price).toBe(1000)
    expect(overlaid.cancellation_total).toBe(23.6)
    expect(overlaid.balance_delta).toBe(r2(sale.bank_settlement - 94.4 - 23.6))
  })

  it("admin pay never goes negative when reverse exceeds bank I", () => {
    const sale = settle("sale", { item_price: 10, logistic_fee: 0 })
    const overlaid = overlaySaleDeductions(
      sale,
      { reverse_logistic_fee: 500 },
      DEFAULT_LEDGER_RATES
    )
    expect(overlaid.balance_delta).toBeLessThan(0)
    expect(adminPayableNetFromLedger(overlaid)).toBe(0)
  })

  it("no-ops for non-sale categories", () => {
    const ret = settle("return", { item_price: 1000, logistic_fee: 50 })
    expect(overlaySaleDeductions(ret, { reverse_logistic_fee: 80 }, DEFAULT_LEDGER_RATES)).toEqual(
      ret
    )
  })
})

describe("claim / payment / junk inputs", () => {
  it("claim credits the claim amount only — no fees", () => {
    const row = settle("claim", { claim_amount: 250, item_price: 999, logistic_fee: 99 })
    expect(row.item_price).toBe(0)
    expect(row.platform_fee).toBe(0)
    expect(row.tcs).toBe(0)
    expect(row.claim_amount).toBe(250)
    expect(row.bank_settlement).toBe(250)
    expect(row.balance_delta).toBe(250)
  })

  it("negative or empty claim becomes 0", () => {
    expect(settle("claim", { claim_amount: -40 }).balance_delta).toBe(0)
    expect(settle("claim", { claim_amount: 0 }).balance_delta).toBe(0)
  })

  it("payment is always stored as a negative withdrawal", () => {
    expect(settle("payment", { payment_amount: 400 }).payment).toBe(-400)
    expect(settle("payment", { payment_amount: -400 }).payment).toBe(-400)
    expect(settle("payment", { payment_amount: 400 }).bank_settlement).toBe(0)
    expect(settle("payment", { payment_amount: 400 }).balance_delta).toBe(-400)
  })

  it("zero / NaN / negative sale inputs do not explode", () => {
    const zero = settle("sale", { item_price: 0, logistic_fee: 0 })
    expect(zero.bank_settlement).toBe(0)
    const nan = settle("sale", { item_price: Number.NaN, logistic_fee: Number.NaN })
    expect(nan.bank_settlement).toBe(0)
    const neg = settle("sale", { item_price: -1000, logistic_fee: -50 })
    expect(neg.item_price).toBe(1000)
    expect(neg.logistic_fee).toBe(50)
    expect(neg.bank_settlement).toBe(LOCKED_SALE_1000_50.bank_settlement)
  })
})

describe("rate clamps + platform offer resolution", () => {
  it("clampLedgerRate falls back on NaN, floors at 0, caps at 100", () => {
    expect(clampLedgerRate("x", 5)).toBe(5)
    expect(clampLedgerRate(undefined, 5)).toBe(5)
    expect(clampLedgerRate(null, 5)).toBe(0)
    expect(clampLedgerRate(-8, 5)).toBe(0)
    expect(clampLedgerRate(250, 5)).toBe(100)
    expect(clampLedgerRate("3.5", 5)).toBe(3.5)
  })

  it("custom vendor offer wins only when override is true", () => {
    expect(
      resolveVendorPlatformFeeRate({ platform_fee_override: true, platform_fee_rate: 3 }, 5)
    ).toEqual({ rate: 3, source: "custom" })
    expect(
      resolveVendorPlatformFeeRate({ platform_fee_override: false, platform_fee_rate: 3 }, 5)
    ).toEqual({ rate: 5, source: "global" })
    expect(
      resolveVendorPlatformFeeRate({ platform_fee_override: true, platform_fee_rate: undefined }, 5)
    ).toEqual({ rate: 5, source: "custom" })
  })

  it("cancellation charge is rupees, not a percent", () => {
    expect(clampRupeeAmount(50)).toBe(50)
    expect(clampRupeeAmount(-10)).toBe(0)
    expect(clampRupeeAmount(999999)).toBe(100000)
    expect(
      resolveVendorCancellationCharge(
        { cancellation_charge_override: true, cancellation_charge: 75 },
        0
      )
    ).toEqual({ amount: 75, source: "custom" })
    expect(
      resolveVendorCancellationCharge(
        { cancellation_charge_override: false, cancellation_charge: 75 },
        40
      )
    ).toEqual({ amount: 40, source: "global" })
  })
})

describe("shipping metadata — Easy vs Self vs return courier", () => {
  it("Easy Ship deducts easy_courier_rate; Self is 0", () => {
    const meta = {
      vendor_order_workflows: {
        v1: { shipping_method: "easy", easy_courier_rate: 67.4, return_courier_rate: 80 },
        v2: { shipping_method: "self", easy_courier_rate: 67.4, return_courier_rate: 80 },
      },
    }
    expect(resolveVendorLogisticFee(meta, "v1")).toBe(67.4)
    expect(resolveVendorLogisticFee(meta, "v2")).toBe(0)
    expect(resolveVendorLogisticFee(meta, "missing")).toBe(0)
    expect(resolveVendorLogisticFee(null, "v1")).toBe(0)
    expect(resolveVendorReturnFee(meta, "v1")).toBe(80)
    expect(resolveVendorReturnFee(meta, "v2")).toBe(80)
    expect(resolveVendorReturnFee({}, "v1")).toBe(0)
  })
})

describe("GST-inclusive catalog price feeds ledger A", () => {
  it("₹100 inclusive @ 18% → taxable 84.75 is the ledger item price", () => {
    const split = calculateMarketplaceSettlement({
      inclusive_amount: 100,
      gst_rate: 18,
      commission_rate: 2,
      tcs_rate: 0.5,
      tds_rate: 0.1,
    })
    expect(split.taxable_amount).toBe(84.75)
    expect(split.gst_amount).toBe(15.25)
    const row = settle("sale", { item_price: split.taxable_amount, logistic_fee: 0 })
    expect(row.item_price).toBe(84.75)
    expect(row.tcs).toBe(r2((84.75 * 0.5) / 100))
    expect(row.tds).toBe(r2((84.75 * 0.1) / 100))
  })
})
