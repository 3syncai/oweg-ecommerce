import {
  calculateVendorLedgerSettlement,
  type LedgerRates,
} from "../vendor-ledger-settlement"

const TEST_RATES: LedgerRates = {
  platform_rate: 5,
  commission_rate: 2,
  partner_rate: 11,
  output_gst_rate: 18,
  service_gst_rate: 18,
  tcs_rate: 0.5,
  tds_rate: 0.1,
  payment_gateway_rate: 2,
}

describe("Payment Gateway 2% Charge Conditions", () => {
  // Product: ₹1,152.54 + 18% GST (₹207.46) = ₹1,360.00 product total
  // 2% of ₹1,360.00 = ₹27.20
  // 18% GST on ₹27.20 = ₹4.90
  // Total PG charge = ₹32.10

  it("Condition 1: if payment is prepaid then deduct 2% payment charge on sale", () => {
    const res = calculateVendorLedgerSettlement({
      category: "sale",
      item_price: 1152.54,
      logistic_fee: 79,
      rates: TEST_RATES,
      payment_method: "razorpay",
    })
    expect(res.payment_gateway_fee).toBe(27.2)
    expect(res.payment_gateway_gst).toBe(4.9)
    expect(res.payment_gateway_total).toBe(32.1)
    // Bank settlement should reflect the 32.10 deduction
    // Listing total: 1360 + 93.22 = 1453.22
    // Deductions: platform 68.00 + comm 27.20 + partner 188.62 + log 93.22 + tcs 5.76 + tds 1.15 + pg 32.10
    expect(res.bank_settlement).toBe(
      Math.round(
        (1453.22 - 68.0 - 27.2 - 188.62 - 93.22 - 5.76 - 1.15 - 32.1) * 100
      ) / 100
    )
  })

  it("Condition 2: if payment is cod and it is delivered then take 2% charge", () => {
    const res = calculateVendorLedgerSettlement({
      category: "sale",
      item_price: 1152.54,
      logistic_fee: 79,
      rates: TEST_RATES,
      payment_method: "cod",
      is_delivered: true,
    })
    expect(res.payment_gateway_fee).toBe(27.2)
    expect(res.payment_gateway_gst).toBe(4.9)
    expect(res.payment_gateway_total).toBe(32.1)
  })

  it("Condition 2b: if payment is cod and it is NOT delivered (in transit) then do NOT charge 2%", () => {
    const res = calculateVendorLedgerSettlement({
      category: "sale",
      item_price: 1152.54,
      logistic_fee: 79,
      rates: TEST_RATES,
      payment_method: "cod",
      is_delivered: false,
    })
    expect(res.payment_gateway_fee).toBe(0)
    expect(res.payment_gateway_gst).toBe(0)
    expect(res.payment_gateway_total).toBe(0)
  })

  it("Condition 3: if order is cancelled and it is cod then don't charge 2%", () => {
    const res = calculateVendorLedgerSettlement({
      category: "cancellation",
      item_price: 1152.54,
      logistic_fee: 79,
      cancellation_fee: 50,
      rates: TEST_RATES,
      payment_method: "cod",
    })
    expect(res.payment_gateway_fee).toBe(0)
    expect(res.payment_gateway_gst).toBe(0)
    expect(res.payment_gateway_total).toBe(0)
  })

  it("Condition 4: if order is cancelled and it is prepaid then charge 2%", () => {
    const res = calculateVendorLedgerSettlement({
      category: "cancellation",
      item_price: 1152.54,
      logistic_fee: 79,
      cancellation_fee: 50,
      rates: TEST_RATES,
      payment_method: "razorpay",
    })
    expect(res.payment_gateway_fee).toBe(27.2)
    expect(res.payment_gateway_gst).toBe(4.9)
    expect(res.payment_gateway_total).toBe(32.1)
  })

  it("Condition 5: if order is returned and prepaid then deduct 2% payment gateway charge", () => {
    const res = calculateVendorLedgerSettlement({
      category: "return",
      item_price: 1152.54,
      logistic_fee: 79,
      reverse_logistic_fee: 89,
      rates: TEST_RATES,
      payment_method: "razorpay",
    })
    expect(res.payment_gateway_fee).toBe(27.2)
    expect(res.payment_gateway_gst).toBe(4.9)
    expect(res.payment_gateway_total).toBe(32.1)
  })
})
