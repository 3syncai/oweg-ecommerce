import { allocateVendorCouponCashback, fetchVendorCouponCashback } from "../vendor-coupon-cashback"

const line = (vendor: string | null, total: number, coupon = 0) => ({
  vendor_id: vendor, line_total: total, coupon_discount: coupon,
})

describe("coupon + coin discounts as vendor cashback", () => {
  it("sums coupon and redeemed coins when both are applied", () => {
    const amounts = allocateVendorCouponCashback({
      promo_code: "SAVE200", promo_discount_rupees: 150,
      coin_discount_rupees: 50,
    }, [line("v1", 1000, 150)])
    expect(amounts.get("v1")).toBe(200)
  })

  it("credits coin-only redemptions as cashback", () => {
    expect(allocateVendorCouponCashback(
      { coin_discount_rupees: 2, coin_discount_minor: 200, coins_discounted: 2 },
      [line("v1", 100)]
    ).get("v1")).toBe(2)
  })

  it("adds coins on top of native item coupons", () => {
    const amounts = allocateVendorCouponCashback(
      { coin_discount_rupees: 10 },
      [line("v1", 100, 20), line("v2", 200, 0)]
    )
    // 20 coupon on v1 + 10 coins split 100:200 → 3.33 / 6.67
    expect(amounts.get("v1")).toBeCloseTo(23.33, 2)
    expect(amounts.get("v2")).toBeCloseTo(6.67, 2)
    expect((amounts.get("v1") || 0) + (amounts.get("v2") || 0)).toBeCloseTo(30, 2)
  })

  it("does not double count mirrored minor amounts or the first item's adjustment", () => {
    const amounts = allocateVendorCouponCashback({
      promo_discount_rupees: 100, promo_discount_minor: 10000,
      oweg10_discount_minor: 5000,
    }, [line("v1", 100, 150), line("v2", 200)])
    expect([...amounts]).toEqual([["v1", 50], ["v2", 100]])
  })

  it("keeps native item coupons with their vendor", () => {
    expect([...allocateVendorCouponCashback(null, [line("v1", 100, 20), line("v2", 200, 0)])])
      .toEqual([["v1", 20], ["v2", 0]])
  })

  it("allocates rounding remainders exactly without giving other vendors unassigned items' shares", () => {
    const shares = allocateVendorCouponCashback({ promo_discount_rupees: 0.05 }, [
      line("v1", 1), line("v2", 1), line(null, 1),
    ])
    expect([...shares]).toEqual([["v1", 0.02], ["v2", 0.02]])
    expect([...allocateVendorCouponCashback({ promo_discount_rupees: 0.05 }, [
      line("v1", 1), line("v2", 1), line("v3", 1),
    ])].reduce((sum, [, amount]) => sum + amount, 0)).toBeCloseTo(0.05)
  })

  it("caps discounts at the item subtotal and aggregates multiple lines per vendor", () => {
    expect([...allocateVendorCouponCashback({ promo_discount_rupees: 1000 }, [
      line("v1", 10), line("v1", 20), line("v2", 30),
    ])]).toEqual([["v1", 30], ["v2", 30]])
  })

  it("returns zero for no discount and invalid amounts", () => {
    for (const metadata of [null, { promo_discount_rupees: -50 }, { promo_discount_rupees: Infinity }]) {
      expect(allocateVendorCouponCashback(metadata, [line("v1", 100)]).get("v1") || 0).toBe(0)
    }
    expect(allocateVendorCouponCashback({ promo_discount_rupees: 10 }, []).size).toBe(0)
  })

  it("loads the requested order and uses stored actual discounts including coins", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [
      { ...line("v1", 300), metadata: { promo_discount_rupees: 20, coin_discount_rupees: 5 } },
    ] })
    expect((await fetchVendorCouponCashback("ord_coupon", { query } as any)).get("v1")).toBe(25)
    expect(query.mock.calls[0][1]).toEqual(["ord_coupon"])
  })
})
