import {
  isRazorpayPayoutSettled,
  markVendorEarningsAsPaid,
  normalizePayoutOrderIds,
} from "../vendor-earnings"

describe("normalizePayoutOrderIds", () => {
  it("dedupes arrays and CSV", () => {
    expect(normalizePayoutOrderIds([" a ", "b", "a", ""])).toEqual(["a", "b"])
    expect(normalizePayoutOrderIds('["x","y","x"]')).toEqual(["x", "y"])
    expect(normalizePayoutOrderIds("o1,o2, o1")).toEqual(["o1", "o2"])
  })

  it("returns empty for missing input", () => {
    expect(normalizePayoutOrderIds(undefined)).toEqual([])
    expect(normalizePayoutOrderIds(null)).toEqual([])
    expect(normalizePayoutOrderIds([])).toEqual([])
  })
})

describe("isRazorpayPayoutSettled", () => {
  it("only treats processed as settled", () => {
    expect(isRazorpayPayoutSettled("processed")).toBe(true)
    expect(isRazorpayPayoutSettled("pending")).toBe(false)
    expect(isRazorpayPayoutSettled("processing")).toBe(false)
    expect(isRazorpayPayoutSettled("queued")).toBe(false)
  })
})

describe("markVendorEarningsAsPaid", () => {
  it("throws when order_ids are missing", async () => {
    const pool = { query: jest.fn() } as any
    await expect(markVendorEarningsAsPaid("vend_1", pool, [])).rejects.toThrow(
      /order_ids are required/
    )
    expect(pool.query).not.toHaveBeenCalled()
  })

  it("updates only scoped CREDITED rows", async () => {
    const pool = {
      query: jest.fn(async () => ({ rowCount: 2, rows: [{ id: "1" }, { id: "2" }] })),
    } as any
    const marked = await markVendorEarningsAsPaid("vend_1", pool, ["ord_a", "ord_b"])
    expect(marked).toBe(2)
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("order_id = ANY($2::text[])"),
      ["vend_1", ["ord_a", "ord_b"]]
    )
    expect(pool.query.mock.calls[0][0]).not.toMatch(
      /WHERE vendor_id = \$1\s+AND status = 'CREDITED'\s+RETURNING/
    )
  })
})
