/**
 * Category-level Return & Replacement Policy
 *
 * Admin can configure return and replacement durations per product category
 * and subcategory. Subcategory rules take precedence over parent category rules.
 * These durations feed into the vendor payout hold / protection window.
 *
 * Table: category_return_policy
 *   id                    TEXT PK
 *   category_id           TEXT NOT NULL UNIQUE   -- Medusa product_category.id
 *   category_name         TEXT NOT NULL          -- denormalized for display
 *   parent_category_id    TEXT                   -- null = top-level
 *   parent_category_name  TEXT
 *   return_window_days    INTEGER NOT NULL DEFAULT 7
 *   replacement_window_days INTEGER NOT NULL DEFAULT 7
 *   created_at            TIMESTAMPTZ
 *   updated_at            TIMESTAMPTZ
 */

import type { Pool } from "pg"

export type CategoryReturnPolicy = {
  id: string
  category_id: string
  category_name: string
  parent_category_id: string | null
  parent_category_name: string | null
  return_window_days: number
  replacement_window_days: number
  created_at: string
  updated_at: string
}

let tableReady: Promise<void> | null = null

export async function ensureCategoryReturnPolicyTable(pool: Pool): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(
        `
        CREATE TABLE IF NOT EXISTS category_return_policy (
          id                    TEXT PRIMARY KEY,
          category_id           TEXT NOT NULL,
          category_name         TEXT NOT NULL,
          parent_category_id    TEXT,
          parent_category_name  TEXT,
          return_window_days    INTEGER NOT NULL DEFAULT 7,
          replacement_window_days INTEGER NOT NULL DEFAULT 7,
          created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS category_return_policy_category_id_idx
          ON category_return_policy (category_id);
        `
      )
      .then(() => undefined)
      .catch((err) => {
        tableReady = null
        throw err
      })
  }
  await tableReady
}

export async function listCategoryReturnPolicies(
  pool: Pool
): Promise<CategoryReturnPolicy[]> {
  await ensureCategoryReturnPolicyTable(pool)
  const result = await pool.query<CategoryReturnPolicy>(
    `SELECT * FROM category_return_policy ORDER BY parent_category_name NULLS FIRST, category_name`
  )
  return result.rows
}

export async function upsertCategoryReturnPolicy(
  pool: Pool,
  policy: {
    category_id: string
    category_name: string
    parent_category_id?: string | null
    parent_category_name?: string | null
    return_window_days: number
    replacement_window_days: number
  }
): Promise<CategoryReturnPolicy> {
  await ensureCategoryReturnPolicyTable(pool)
  const id = `crp_${policy.category_id}`
  const result = await pool.query<CategoryReturnPolicy>(
    `
    INSERT INTO category_return_policy
      (id, category_id, category_name, parent_category_id, parent_category_name,
       return_window_days, replacement_window_days, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    ON CONFLICT (category_id) DO UPDATE SET
      category_name         = EXCLUDED.category_name,
      parent_category_id    = EXCLUDED.parent_category_id,
      parent_category_name  = EXCLUDED.parent_category_name,
      return_window_days    = EXCLUDED.return_window_days,
      replacement_window_days = EXCLUDED.replacement_window_days,
      updated_at            = NOW()
    RETURNING *
    `,
    [
      id,
      policy.category_id,
      policy.category_name,
      policy.parent_category_id ?? null,
      policy.parent_category_name ?? null,
      policy.return_window_days,
      policy.replacement_window_days,
    ]
  )
  return result.rows[0]
}

export async function deleteCategoryReturnPolicy(
  pool: Pool,
  category_id: string
): Promise<boolean> {
  await ensureCategoryReturnPolicyTable(pool)
  const result = await pool.query(
    `DELETE FROM category_return_policy WHERE category_id = $1`,
    [category_id]
  )
  return (result.rowCount ?? 0) > 0
}

export type EffectiveReturnPolicy = {
  return_window_days: number
  replacement_window_days: number
}

/** The deepest assigned category wins; its nearest configured ancestor is inherited. */
export async function resolveReturnPolicyForProduct(
  pool: Pool,
  categoryIds: string[]
): Promise<EffectiveReturnPolicy> {
  const fallback = { return_window_days: 7, replacement_window_days: 7 }
  if (!categoryIds.length) return fallback
  await ensureCategoryReturnPolicyTable(pool)

  const result = await pool.query<{
    id: string
    parent_category_id: string | null
    return_window_days: number | null
    replacement_window_days: number | null
  }>(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_category_id FROM product_category WHERE id = ANY($1::text[])
       UNION
       SELECT parent.id, parent.parent_category_id
       FROM product_category parent
       JOIN ancestors child ON child.parent_category_id = parent.id
     )
     SELECT ancestors.id, ancestors.parent_category_id,
            policy.return_window_days, policy.replacement_window_days
     FROM ancestors
     LEFT JOIN category_return_policy policy ON policy.category_id = ancestors.id`,
    [categoryIds]
  )
  const categories = new Map(result.rows.map((row) => [row.id, row]))
  const depth = (id: string): number => {
    let count = 0
    let current = categories.get(id)
    const seen = new Set<string>()
    while (current?.parent_category_id && !seen.has(current.id)) {
      seen.add(current.id)
      count++
      current = categories.get(current.parent_category_id)
    }
    return count
  }

  for (const id of [...new Set(categoryIds)].sort((a, b) => depth(b) - depth(a))) {
    let current = categories.get(id)
    const seen = new Set<string>()
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      if (current.return_window_days !== null && current.replacement_window_days !== null) {
        return {
          return_window_days: Number(current.return_window_days),
          replacement_window_days: Number(current.replacement_window_days),
        }
      }
      current = current.parent_category_id ? categories.get(current.parent_category_id) : undefined
    }
  }
  return fallback
}

export async function resolveHoldDaysForProduct(
  pool: Pool,
  opts: { category_ids: string[] }
): Promise<number> {
  const policy = await resolveReturnPolicyForProduct(pool, opts.category_ids)
  return Math.max(policy.return_window_days, policy.replacement_window_days)
}
