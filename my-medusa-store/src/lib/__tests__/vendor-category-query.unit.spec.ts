import { scheduleVendorEarningsOnDelivery } from "../vendor-earnings"

describe("vendor earnings category lookup", () => {
  it("uses Medusa's product_category_id join column", async () => {
    const query = jest.fn(async () => ({ rows: [], rowCount: 0 }))

    await scheduleVendorEarningsOnDelivery(
      "order_category_check",
      { query } as any,
      { vendorId: "vendor_1" }
    )

    const categoryQuery = query.mock.calls.find(([sql]) =>
      String(sql).includes("AS product_category_ids")
    )
    expect(categoryQuery).toBeDefined()
    expect(String(categoryQuery?.[0])).toContain("pcp.product_category_id")
    expect(String(categoryQuery?.[0])).not.toContain("pcp.category_id")
  })
})
