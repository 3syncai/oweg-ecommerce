import { calculateVendorLedgerSettlement } from "../vendor-ledger-settlement"
import { chargeVendorRelocationCancellation, reverseVendorEarningsForOrder } from "../vendor-earnings"

/**
 * M4: cancel charge must be a CREDITED debit (hits payable), not a stamp on REVERSED net=0.
 * Unbooked customer cancel is ₹0. Booked cancel charges shipping + cancel fee.
 */
describe("cancellation fee CREDITED debit", () => {
  it("charges the outgoing vendor once for reassignment without a gateway fee", async () => {
    const inserts: unknown[][] = []
    const pool = { query: jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("INSERT INTO vendor_earnings_log")) {
        inserts.push(params)
        return { rowCount: inserts.length === 1 ? 1 : 0, rows: [] }
      }
      return { rowCount: 0, rows: [] }
    }) } as any
    const rates = { commission_rate: 2, platform_fee_rate: 5, cancellation_charge: 20,
      partner_rate: 0, service_gst_rate: 18, tcs_rate: 0, tds_rate: 0,
      snapshotted_at: "2026-10-18T00:00:00.000Z" }
    await chargeVendorRelocationCancellation("order_move", "vendor_a", pool, {
      orderMetadata: { payment_method: "razorpay" }, frozenRates: rates,
    })
    await chargeVendorRelocationCancellation("order_move", "vendor_a", pool, {
      orderMetadata: { payment_method: "razorpay" }, frozenRates: rates,
    })
    expect(inserts).toHaveLength(2)
    expect(inserts[0][0]).toBe("cancel-fee:order_move")
    expect(inserts[0][1]).toBe("vendor_a")
    expect(inserts[0][3]).toBe(-23.6)
    expect(inserts[0][4]).toBe(0)
  })

  it("charges only the current vendor for full prepaid cancellation", async () => {
    const inserts: unknown[][] = []
    const pool = { query: jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("SELECT DISTINCT ON (oli.id)")) return { rowCount: 2, rows: [
        { vendor_id: "vendor_a", order_display_id: "1181", line_total: 496, product_gst_rate: "18" },
        { vendor_id: "vendor_b", order_display_id: "1181", line_total: 496, product_gst_rate: "18" },
      ] }
      if (sql.includes("SELECT metadata") && sql.includes('"order"')) return { rowCount: 1, rows: [{ metadata: {
        payment_method: "razorpay", vendor_order_workflows: { vendor_b: { settlement_rates: {
          commission_rate: 2, platform_fee_rate: 5, cancellation_charge: 20,
          partner_rate: 0, partner_linked: false, service_gst_rate: 18,
          tcs_rate: 0, tds_rate: 0, snapshotted_at: "2026-10-18T00:00:00.000Z",
        } } },
      } }] }
      if (sql.includes("INSERT INTO vendor_earnings_log")) {
        inserts.push(params)
        return { rowCount: 1, rows: [{ id: "fee_b" }] }
      }
      return { rowCount: 0, rows: [] }
    }) } as any
    await reverseVendorEarningsForOrder("order_cancel", pool, "admin-cancelled", {
      vendorIds: ["vendor_b"], vendorScoped: true, applyCancellationCharge: true,
    })
    expect(inserts).toHaveLength(1)
    expect(inserts[0][1]).toBe("vendor_b")
    expect(inserts[0][3]).toBe(-33.52)
    expect(inserts[0][4]).toBe(420.34)
  })

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
    // The synthetic row retains product taxable value at $5; cancellation fee
    // and logistics stay in their matching columns for ledger reconstruction.
    expect(insert!.params[8]).toBe(25)
    expect(insert!.params[7]).toBe(50)
  })

  it("charges the gateway fee for an explicitly prepaid admin cancellation", () => {
    const ledger = calculateVendorLedgerSettlement({
      category: "cancellation",
      item_price: 0,
      payment_gateway_base: 420.34,
      logistic_fee: 0,
      cancellation_fee: 20,
      payment_method: "razorpay",
      rates: {
        platform_rate: 5,
        commission_rate: 2,
        partner_rate: 11,
        output_gst_rate: 18,
        service_gst_rate: 18,
        tcs_rate: 0.5,
        tds_rate: 0.1,
        payment_gateway_rate: 2,
      },
    })

    expect(ledger.cancellation_total).toBe(23.6)
    expect(ledger.payment_gateway_fee).toBe(8.41)
    expect(ledger.payment_gateway_gst).toBe(1.51)
    expect(ledger.balance_delta).toBe(-33.52)
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
