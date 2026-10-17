import type { Pool } from "pg"
import { resolveReturnPolicyForProduct, resolveHoldDaysForProduct } from "../vendor-return-policy"

function fakePool(rows: Array<{
  id: string
  parent_category_id: string | null
  return_window_days: number | null
  replacement_window_days: number | null
}>): Pool {
  return {
    query: jest.fn(async (sql: string) => ({
      rows: sql.includes("WITH RECURSIVE") ? rows : [],
    })),
  } as unknown as Pool
}

describe("admin category return policy", () => {
  it("uses a subcategory override before its parent", async () => {
    const pool = fakePool([
      { id: "parent", parent_category_id: null, return_window_days: 7, replacement_window_days: 7 },
      { id: "child", parent_category_id: "parent", return_window_days: 14, replacement_window_days: 3 },
    ])
    expect(await resolveReturnPolicyForProduct(pool, ["parent", "child"])).toEqual({
      return_window_days: 14,
      replacement_window_days: 3,
    })
    expect(await resolveHoldDaysForProduct(pool, { category_ids: ["child"] })).toBe(14)
  })

  it("inherits its nearest parent policy and preserves zero days", async () => {
    const pool = fakePool([
      { id: "parent", parent_category_id: null, return_window_days: 0, replacement_window_days: 10 },
      { id: "child", parent_category_id: "parent", return_window_days: null, replacement_window_days: null },
    ])
    expect(await resolveReturnPolicyForProduct(pool, ["child"])).toEqual({
      return_window_days: 0,
      replacement_window_days: 10,
    })
  })
})
