import {
  weightedPartnerRateFromLines,
  lookupCatalogCommissionAt,
  CatalogCommissionConflict,
} from "../catalog-partner-commission"

describe("weightedPartnerRateFromLines", () => {
  it("returns 0 when no lines or all zero totals", () => {
    expect(weightedPartnerRateFromLines([])).toBe(0)
    expect(weightedPartnerRateFromLines([{ line_total: 0, rate: 11 }])).toBe(0)
  })

  it("returns the product rate when a single line has a catalog commission", () => {
    expect(
      weightedPartnerRateFromLines([{ line_total: 1000, rate: 7 }])
    ).toBe(7)
  })

  it("weights mixed lines so products without NH commission contribute 0", () => {
    // ₹800 @ 5% + ₹200 @ 0% → 4%
    expect(
      weightedPartnerRateFromLines([
        { line_total: 800, rate: 5 },
        { line_total: 200, rate: 0 },
      ])
    ).toBe(4)
  })

  it("does not fall back to a fixed 11% when rates are missing", () => {
    expect(
      weightedPartnerRateFromLines([
        { line_total: 500, rate: 0 },
        { line_total: 500, rate: 0 },
      ])
    ).toBe(0)
  })
})

describe("lookupCatalogCommissionAt", () => {
  function mockDb(handlers: Record<string, (sql: string, params: unknown[]) => { rows: any[] }>) {
    return {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        for (const [key, handler] of Object.entries(handlers)) {
          if (sql.includes(key)) return handler(sql, params)
        }
        return { rows: [] }
      }),
    }
  }

  it("ignores rules created after the order (no retroactive cut)", async () => {
    const orderAt = new Date("2026-01-10T10:00:00.000Z")
    const db = mockDb({
      "SELECT id, metadata FROM product": () => ({
        rows: [{ id: "prod_1", metadata: {} }],
      }),
      "WITH RECURSIVE family": () => ({ rows: [{ id: "prod_1" }] }),
      "WHERE product_id = ANY": (_sql, params) => {
        // asOf is params[1]
        expect(String(params[1])).toContain("2026-01-10")
        return { rows: [] } // nothing active at order time
      },
      "WITH RECURSIVE categories": () => ({ rows: [] }),
    })

    const rule = await lookupCatalogCommissionAt(db as any, "prod_1", orderAt)
    expect(rule).toBeNull()
  })

  it("returns the catalog rate that was active at asOf", async () => {
    const orderAt = new Date("2026-01-10T10:00:00.000Z")
    const db = mockDb({
      "SELECT id, metadata FROM product": () => ({
        rows: [{ id: "prod_1", metadata: {} }],
      }),
      "WITH RECURSIVE family": () => ({ rows: [{ id: "prod_1" }] }),
      "WHERE product_id = ANY": () => ({
        rows: [{ id: "ac_1", commission_rate: 6 }],
      }),
    })

    const rule = await lookupCatalogCommissionAt(db as any, "prod_1", orderAt)
    expect(rule).toEqual({
      id: "ac_1",
      rate: 6,
      source: "catalog",
      categoryId: null,
    })
  })

  it("fails closed on conflicting family rates", async () => {
    const db = mockDb({
      "SELECT id, metadata FROM product": () => ({
        rows: [{ id: "prod_1", metadata: {} }],
      }),
      "WITH RECURSIVE family": () => ({
        rows: [{ id: "prod_1" }, { id: "prod_2" }],
      }),
      "WHERE product_id = ANY": () => ({
        rows: [
          { id: "ac_1", commission_rate: 5 },
          { id: "ac_2", commission_rate: 8 },
        ],
      }),
    })

    await expect(
      lookupCatalogCommissionAt(db as any, "prod_1", new Date())
    ).rejects.toBeInstanceOf(CatalogCommissionConflict)
  })
})
