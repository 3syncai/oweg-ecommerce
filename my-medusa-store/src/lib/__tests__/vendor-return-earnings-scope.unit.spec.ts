/**
 * Behavioral contract for return-scoped earnings helpers.
 * SQL helpers need a DB; here we assert the public API refuses unscoped return ops
 * when given an empty vendor list (no pool queries should run for the UPDATE).
 */
import {
  creditVendorEarningsAfterReturnRejected,
  holdVendorEarningsForReturn,
  reverseVendorEarningsForOrder,
} from "../vendor-earnings"

function fakePool() {
  return {
    query: jest.fn(async () => {
      throw new Error("pool.query should not run for unscoped return ops")
    }),
  } as any
}

describe("return earnings vendor scope", () => {
  it("hold refuses empty vendor scope", async () => {
    const result = await holdVendorEarningsForReturn("order_1", fakePool(), {
      vendorIds: [],
    })
    expect(result).toEqual({
      held: 0,
      skipped: true,
      skipped_unscoped: true,
    })
  })

  it("credit refuses empty vendor scope", async () => {
    const result = await creditVendorEarningsAfterReturnRejected(
      "order_1",
      fakePool(),
      { vendorIds: [] }
    )
    expect(result).toEqual({
      credited: 0,
      skipped: true,
      skipped_unscoped: true,
    })
  })

  it("reverse with vendorScoped refuses empty vendor scope", async () => {
    const result = await reverseVendorEarningsForOrder(
      "order_1",
      fakePool(),
      "return_approved",
      { vendorIds: [], vendorScoped: true }
    )
    expect(result).toEqual({
      reversed: 0,
      clawed_back: 0,
      cancel_fees: 0,
      skipped: true,
      skipped_unscoped: true,
    })
  })

  it("full cancel reverse without scope still queries the pool", async () => {
    const pool = {
      query: jest.fn(async () => ({ rowCount: 0, rows: [] })),
    } as any
    const result = await reverseVendorEarningsForOrder(
      "order_1",
      pool,
      "cancelled"
    )
    expect(pool.query).toHaveBeenCalled()
    expect(result.skipped_unscoped).toBeUndefined()
    expect(result.clawed_back).toBe(0)
    expect(result.cancel_fees).toBe(0)
  })
})
