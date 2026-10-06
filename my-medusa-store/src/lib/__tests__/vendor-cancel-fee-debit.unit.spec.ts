import { reverseVendorEarningsForOrder } from "../vendor-earnings"

/**
 * M4: cancel charge must be a CREDITED debit (hits payable), not a stamp on REVERSED net=0.
 * Unbooked customer cancel is ₹0. Booked cancel charges shipping + cancel fee.
 */
describe("cancellation fee CREDITED debit", () => {
  it("charges nothing when customer cancels before packet is booked", async () => {
    const calls: { sql: string; params: unknown[] }[] = []
    const pool = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        if (sql.includes("UPDATE vendor_earnings_log") && sql.includes("REVERSED")) {
          return { rowCount: 0, rows: [] }
        }
        if (sql.includes("ADD COLUMN") || sql.includes("CREATE TABLE")) {
          return { rowCount: 0, rows: [] }
        }
        if (sql.includes("status = 'PAID'") && sql.includes("SELECT")) {
          return { rowCount: 0, rows: [] }
        }
        if (sql.includes("p.metadata->>'vendor_id'") && sql.includes("order_item")) {
          return {
            rowCount: 1,
            rows: [
              {
                vendor_id: "ven_pre",
                order_display_id: "2201",
                line_total: 1000,
                product_gst_rate: "18",
                product_tax_code: null,
                item_gst_rate: null,
                item_tax_code: null,
              },
            ],
          }
        }
        if (sql.includes("SELECT metadata") && sql.includes('"order"')) {
          return {
            rowCount: 1,
            rows: [
              {
                metadata: {
                  vendor_order_workflows: {
                    ven_pre: {
                      stage: "to_pack",
                      shipping_method: "easy",
                      easy_booking_status: "intent",
                      settlement_rates: {
                        commission_rate: 2,
                        platform_fee_rate: 5,
                        cancellation_charge: 25,
                        partner_rate: 11,
                        service_gst_rate: 18,
                        tcs_rate: 0.5,
                        tds_rate: 0.1,
                        snapshotted_at: "2026-01-01T00:00:00.000Z",
                      },
                    },
                  },
                },
                display_id: "2201",
              },
            ],
          }
        }
        return { rowCount: 0, rows: [] }
      }),
    } as any

    const result = await reverseVendorEarningsForOrder(
      "order_pre",
      pool,
      "cancelled"
    )

    expect(result.reversed).toBe(0)
    expect(result.cancel_fees).toBe(0)
    expect(result.skipped).toBe(true)
    expect(
      calls.some(
        (c) =>
          c.sql.includes("INSERT INTO vendor_earnings_log") &&
          String(c.params[0] || "").startsWith("cancel-fee:")
      )
    ).toBe(false)
  })

  it("inserts cancel-fee+logistics debit when packet is booked before delivery", async () => {
    const calls: { sql: string; params: unknown[] }[] = []
    const pool = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        if (sql.includes("UPDATE vendor_earnings_log") && sql.includes("REVERSED")) {
          return { rowCount: 0, rows: [] }
        }
        if (sql.includes("ADD COLUMN") || sql.includes("CREATE TABLE")) {
          return { rowCount: 0, rows: [] }
        }
        if (sql.includes("status = 'PAID'") && sql.includes("SELECT")) {
          return { rowCount: 0, rows: [] }
        }
        if (sql.includes("p.metadata->>'vendor_id'") && sql.includes("order_item")) {
          return {
            rowCount: 1,
            rows: [
              {
                vendor_id: "ven_pre",
                order_display_id: "2201",
                line_total: 1000,
                product_gst_rate: "18",
                product_tax_code: null,
                item_gst_rate: null,
                item_tax_code: null,
              },
            ],
          }
        }
        if (sql.includes("SELECT metadata") && sql.includes('"order"')) {
          return {
            rowCount: 1,
            rows: [
              {
                metadata: {
                  vendor_order_workflows: {
                    ven_pre: {
                      shipping_method: "easy",
                      easy_booking_status: "booked",
                      easy_courier_rate: 50,
                      shiprocket_awb: "AWB1",
                      settlement_rates: {
                        commission_rate: 2,
                        platform_fee_rate: 5,
                        cancellation_charge: 25,
                        partner_rate: 11,
                        service_gst_rate: 18,
                        tcs_rate: 0.5,
                        tds_rate: 0.1,
                        snapshotted_at: "2026-01-01T00:00:00.000Z",
                      },
                    },
                  },
                },
                display_id: "2201",
              },
            ],
          }
        }
        if (
          sql.includes("INSERT INTO vendor_earnings_log") &&
          String(params[0] || "").startsWith("cancel-fee:")
        ) {
          return { rowCount: 1, rows: [{ id: "ve_cancel" }] }
        }
        return { rowCount: 0, rows: [] }
      }),
    } as any

    const result = await reverseVendorEarningsForOrder(
      "order_pre",
      pool,
      "cancelled"
    )

    expect(result.reversed).toBe(0)
    expect(result.cancel_fees).toBe(1)

    const insert = calls.find(
      (c) =>
        c.sql.includes("INSERT INTO vendor_earnings_log") &&
        String(c.params[0]).startsWith("cancel-fee:")
    )
    expect(insert).toBeTruthy()
    expect(insert!.params[1]).toBe("ven_pre")
    // 25+18% GST = 29.5 plus 50+18% logistics = 59 → -88.5
    expect(insert!.params[3]).toBe(-88.5)
    expect(insert!.params[6]).toBe(25)
    expect(insert!.params[7]).toBe(50)
  })

  it("does not stamp cancellation_fee onto REVERSED rows", async () => {
    const updates: string[] = []
    const pool = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("UPDATE vendor_earnings_log") && sql.includes("REVERSED")) {
          updates.push(sql)
          return {
            rowCount: 1,
            rows: [
              {
                id: "ve_1",
                vendor_id: "ven_1",
                order_display_id: "99",
              },
            ],
          }
        }
        if (sql.includes("ADD COLUMN")) return { rowCount: 0, rows: [] }
        if (sql.includes("status = 'PAID'")) return { rowCount: 0, rows: [] }
        if (sql.includes("SELECT metadata")) {
          return {
            rowCount: 1,
            rows: [
              {
                metadata: {
                  vendor_order_workflows: {
                    ven_1: {
                      settlement_rates: {
                        commission_rate: 2,
                        platform_fee_rate: 5,
                        cancellation_charge: 20,
                        partner_rate: 11,
                        service_gst_rate: 18,
                        tcs_rate: 0.5,
                        tds_rate: 0.1,
                        snapshotted_at: "2026-01-01T00:00:00.000Z",
                      },
                    },
                  },
                },
              },
            ],
          }
        }
        if (
          sql.includes("INSERT INTO vendor_earnings_log") &&
          String(params[0] || "").startsWith("cancel-fee:")
        ) {
          return { rowCount: 1, rows: [{ id: "ve_cf" }] }
        }
        return { rowCount: 0, rows: [] }
      }),
    } as any

    await reverseVendorEarningsForOrder("order_rev", pool, "cancelled", {
      vendorIds: ["ven_1"],
    })

    expect(updates.some((sql) => sql.includes("cancellation_fee = 0"))).toBe(true)
    expect(
      updates.some(
        (sql) =>
          sql.includes("SET cancellation_fee = $3") && sql.includes("REVERSED")
      )
    ).toBe(false)
  })
})
