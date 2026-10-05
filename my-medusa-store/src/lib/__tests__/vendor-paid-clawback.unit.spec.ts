import { reverseVendorEarningsForOrder } from "../vendor-earnings"

describe("PAID clawback on return/cancel", () => {
  it("inserts a CREDITED clawback debit when a PAID row exists", async () => {
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
          return {
            rowCount: 1,
            rows: [
              {
                vendor_id: "ven_1",
                net_amount: 500,
                order_display_id: "1001",
              },
            ],
          }
        }
        if (sql.includes("INSERT INTO vendor_earnings_log") && sql.includes("clawback")) {
          return { rowCount: 1, rows: [{ id: "ve_claw" }] }
        }
        return { rowCount: 0, rows: [] }
      }),
    } as any

    const result = await reverseVendorEarningsForOrder(
      "order_paid",
      pool,
      "return_approved",
      { vendorIds: ["ven_1"], vendorScoped: true }
    )

    expect(result.reversed).toBe(0)
    expect(result.clawed_back).toBe(1)
    expect(result.skipped).toBe(false)

    const insert = calls.find(
      (c) => c.sql.includes("INSERT INTO vendor_earnings_log") && String(c.params[0]).startsWith("clawback:")
    )
    expect(insert).toBeTruthy()
    expect(insert!.params[0]).toBe("clawback:order_paid")
    expect(insert!.params[1]).toBe("ven_1")
    expect(insert!.params[3]).toBe(-500)
  })
})
