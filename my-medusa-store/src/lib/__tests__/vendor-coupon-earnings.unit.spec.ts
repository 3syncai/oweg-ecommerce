import { recomputeUnpaidVendorLedger, scheduleVendorEarningsOnDelivery } from "../vendor-earnings"
import { DEFAULT_LEDGER_RATES } from "./ledger-test-fixtures"
import { calculateVendorLedgerSettlement, adminPayableNetFromLedger } from "../vendor-ledger-settlement"

jest.mock("../vendor-settlement-snapshot", () => ({
  getOrFreezeOrderSettlementRates: jest.fn(async () => ({
    commission_rate: 2, platform_fee_rate: 5, partner_rate: 0,
    service_gst_rate: 18, tcs_rate: 0.5, tds_rate: 0.1,
  })),
}))
jest.mock("../vendor-return-policy", () => ({ resolveHoldDaysForProduct: jest.fn(async () => 7) }))
jest.mock("../vendor-ledger-settlement", () => ({
  ...jest.requireActual("../vendor-ledger-settlement"),
  buildLedgerRatesForVendor: jest.fn(async () => ({
    ...jest.requireActual("./ledger-test-fixtures").DEFAULT_LEDGER_RATES,
    commission_rate: 2, platform_rate: 5, partner_rate: 0,
  })),
}))
jest.mock("../vendor-marketplace-tax", () => ({
  ...jest.requireActual("../vendor-marketplace-tax"),
  getMarketplaceTaxRates: jest.fn(async () => ({ tcs_rate: 0.5, tds_rate: 0.1 })),
}))

const metadata = { promo_code: "SAVE50", promo_discount_rupees: 50 }
const couponRows = [
  { vendor_id: "v1", line_total: 1180, coupon_discount: 50, metadata },
  { vendor_id: "v2", line_total: 1180, coupon_discount: 0, metadata },
]
const expectedNet = () => adminPayableNetFromLedger(calculateVendorLedgerSettlement({
  category: "sale", item_price: 1000, logistic_fee: 0, cashback_amount: 25,
  rates: { ...DEFAULT_LEDGER_RATES, commission_rate: 2, platform_rate: 5, partner_rate: 0 },
}))

describe("persisting coupon cashback in vendor earnings", () => {
  it("stores only the vendor share on delivery and binds every INSERT parameter", async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes("AS coupon_discount")) return { rows: couponRows }
      if (sql.includes("AS product_category_ids")) return { rows: [{
        vendor_id: "v1", order_display_id: "123", line_total: 1180,
        item_gst_rate: "18", product_category_ids: null,
      }] }
      if (sql.includes('SELECT metadata FROM "order"')) return { rows: [{ metadata }] }
      return { rows: [], rowCount: 1 }
    })
    await scheduleVendorEarningsOnDelivery("order_coupon", { query } as any, { vendorId: "v1" })
    const insert = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO vendor_earnings_log"))!
    expect(insert).toBeDefined()
    const params = insert[1] as unknown[]
    expect(params).toHaveLength(33)
    expect(params[32]).toBe(25)
    expect(params[29]).toBe(expectedNet())
    const categoryLookup = query.mock.calls.find(([sql]) => sql.includes("AS product_category_ids"))![0]
    expect(categoryLookup).toContain("pcp.product_category_id")
    expect(categoryLookup).not.toContain("pcp.category_id")
    expect(Math.max(...[...insert[0].matchAll(/\$(\d+)/g)].map(match => Number(match[1])))).toBe(params.length)
  })

  it("recomputes an absolute credit repeatedly without accumulating cashback or touching paid rows", async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes("AS coupon_discount")) return { rows: couponRows }
      if (sql.includes("SELECT id, order_id, taxable_amount")) return { rows: [{
        id: "earning1", order_id: "order_coupon", taxable_amount: 1000, gst_rate: 18,
        logistic_fee: 0, customer_shipping_total: 0, return_fee: 0, cancellation_fee: 0,
      }] }
      if (sql.includes('FROM "order"')) return { rows: [{ id: "order_coupon", metadata }] }
      return { rows: [], rowCount: 1 }
    })
    await recomputeUnpaidVendorLedger("v1", { query } as any)
    await recomputeUnpaidVendorLedger("v1", { query } as any)
    const updates = query.mock.calls.filter(([sql]) => sql.includes("cashback_amount = $21"))
    expect(updates).toHaveLength(2)
    for (const [sql, values] of updates) {
      expect(sql).toContain("status IN ('UNLOCKING', 'CREDITED', 'ON_HOLD')")
      expect(values?.[19]).toBe(expectedNet())
      expect(values?.[20]).toBe(25)
    }
  })
})
