/**
 * Admin Return & Replacement Policy API
 *
 * GET    /admin/return-policy          - list all category policies
 * POST   /admin/return-policy          - upsert a category policy
 * DELETE /admin/return-policy/:cat_id  - remove a category policy
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import {
  listCategoryReturnPolicies,
  upsertCategoryReturnPolicy,
  deleteCategoryReturnPolicy,
  ensureCategoryReturnPolicyTable,
} from "../../../lib/vendor-return-policy"

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL })
}

/** GET /admin/return-policy */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pool = getPool()
  try {
    const policies = await listCategoryReturnPolicies(pool)
    res.json({ policies, count: policies.length })
  } catch (err: any) {
    console.error("[return-policy] GET error:", err)
    res.status(500).json({ message: "Failed to fetch return policies", error: err?.message })
  } finally {
    await pool.end().catch(() => {})
  }
}

/** POST /admin/return-policy  — upsert */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pool = getPool()
  try {
    const {
      category_id,
      return_window_days,
      replacement_window_days,
    } = req.body as {
      category_id: string
      return_window_days: number | string | null
      replacement_window_days: number | string | null
    }

    if (!category_id) {
      res.status(400).json({ message: "category_id is required" })
      return
    }

    const returnDays = Number(return_window_days)
    const replaceDays = Number(replacement_window_days)

    if (return_window_days == null || return_window_days === "" || !Number.isInteger(returnDays) || returnDays < 0 || returnDays > 365) {
      res.status(400).json({ message: "return_window_days must be an integer 0–365" })
      return
    }
    if (replacement_window_days == null || replacement_window_days === "" || !Number.isInteger(replaceDays) || replaceDays < 0 || replaceDays > 365) {
      res.status(400).json({ message: "replacement_window_days must be an integer 0–365" })
      return
    }

    const categoryResult = await pool.query<{
      name: string
      parent_category_id: string | null
      parent_category_name: string | null
    }>(
      `SELECT category.name, category.parent_category_id,
              parent.name AS parent_category_name
       FROM product_category category
       LEFT JOIN product_category parent ON parent.id = category.parent_category_id
       WHERE category.id = $1 AND category.deleted_at IS NULL`,
      [category_id]
    )
    const category = categoryResult.rows[0]
    if (!category) {
      res.status(404).json({ message: "Category not found" })
      return
    }

    const policy = await upsertCategoryReturnPolicy(pool, {
      category_id,
      category_name: category.name,
      parent_category_id: category.parent_category_id,
      parent_category_name: category.parent_category_name,
      return_window_days: returnDays,
      replacement_window_days: replaceDays,
    })

    res.status(201).json({ policy })
  } catch (err: any) {
    console.error("[return-policy] POST error:", err)
    res.status(500).json({ message: "Failed to save return policy", error: err?.message })
  } finally {
    await pool.end().catch(() => {})
  }
}

/** DELETE /admin/return-policy  — body: { category_id } */
export async function DELETE(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pool = getPool()
  try {
    const { category_id } = req.body as { category_id: string }
    if (!category_id) {
      res.status(400).json({ message: "category_id is required" })
      return
    }

    await ensureCategoryReturnPolicyTable(pool)
    const deleted = await deleteCategoryReturnPolicy(pool, category_id)

    if (!deleted) {
      res.status(404).json({ message: "Policy not found for this category" })
      return
    }

    res.json({ success: true, category_id })
  } catch (err: any) {
    console.error("[return-policy] DELETE error:", err)
    res.status(500).json({ message: "Failed to delete return policy", error: err?.message })
  } finally {
    await pool.end().catch(() => {})
  }
}
