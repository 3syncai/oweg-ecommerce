import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { markVendorEarningsAsPaid } from "../../../lib/vendor-earnings"

/**
 * Admin Vendor Payouts API
 * GET  /admin/vendor-payouts - List payouts (optional ?vendor_id=)
 * POST /admin/vendor-payouts - Create a manual payout record + mark earnings PAID
 */

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL })
}

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pool = getPool()
  try {
    const vendorId =
      typeof req.query?.vendor_id === "string" ? req.query.vendor_id.trim() : null

    const result = vendorId
      ? await pool.query(
          `
            SELECT *
            FROM vendor_payout
            WHERE vendor_id = $1
            ORDER BY created_at DESC
            LIMIT 100
          `,
          [vendorId]
        )
      : await pool.query(
          `
            SELECT *
            FROM vendor_payout
            ORDER BY created_at DESC
            LIMIT 100
          `
        )

    res.json({
      payouts: result.rows || [],
      count: result.rowCount || 0,
    })
  } catch (error: any) {
    const pgError = error as { code?: string }
    if (pgError?.code === "42P01") {
      res.json({ payouts: [], count: 0 })
      return
    }
    console.error("List payouts error:", error)
    res.status(500).json({
      message: "Failed to fetch payouts",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pool = getPool()
  try {
    const {
      vendor_id,
      amount,
      commission_amount,
      net_amount,
      commission_rate,
      transaction_id,
      payment_method = "bank_transfer",
      notes,
      order_ids,
    } = req.body as {
      vendor_id: string
      amount: number
      commission_amount: number
      net_amount: number
      commission_rate: number
      transaction_id: string
      payment_method?: string
      notes?: string
      order_ids?: string[]
    }

    if (!vendor_id || !amount || !transaction_id) {
      res.status(400).json({
        message: "vendor_id, amount, and transaction_id are required",
      })
      return
    }

    const created_by = (req as any).auth_context?.actor_id || (req as any).user?.id || "admin"
    const payoutId = `vpayout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()

    await pool.query(
      `
        INSERT INTO vendor_payout (
          id, vendor_id, amount, commission_amount, net_amount, commission_rate,
          currency_code, transaction_id, payment_method, status, notes, order_ids,
          created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          'inr', $7, $8, 'processed', $9, $10,
          $11, $12, $12
        )
      `,
      [
        payoutId,
        vendor_id,
        amount,
        commission_amount || 0,
        net_amount || amount,
        commission_rate || 0,
        transaction_id,
        payment_method,
        notes || null,
        order_ids ? JSON.stringify(order_ids) : null,
        created_by,
        now,
      ]
    )

    const marked = await markVendorEarningsAsPaid(vendor_id, pool, order_ids)

    const { rows } = await pool.query(`SELECT * FROM vendor_payout WHERE id = $1`, [payoutId])

    res.status(201).json({
      success: true,
      message: "Payout created successfully",
      payout: rows[0] || { id: payoutId },
      earnings_marked_paid: marked,
    })
  } catch (error: any) {
    console.error("Create payout error:", error)
    res.status(500).json({
      message: "Failed to create payout",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}
