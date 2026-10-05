import type { Pool } from "pg"
import { getRazorpayPayout } from "./razorpay-payout"
import {
  isRazorpayPayoutSettled,
  markVendorEarningsAsPaid,
  normalizePayoutOrderIds,
} from "./vendor-earnings"

/**
 * Poll Razorpay for pending/processing payouts and, when status becomes
 * `processed`, flip local payout status + mark those order earnings PAID.
 */
export async function syncPendingRazorpayPayouts(
  pool: Pool,
  options?: { vendorId?: string | null; limit?: number }
): Promise<{ checked: number; settled: number; markedPaid: number }> {
  const limit = Math.min(Math.max(Number(options?.limit) || 25, 1), 100)
  const vendorId = options?.vendorId ? String(options.vendorId).trim() : null

  const result = await pool.query<{
    id: string
    vendor_id: string
    razorpay_payout_id: string
    order_ids: unknown
    status: string | null
  }>(
    `
      SELECT id, vendor_id, razorpay_payout_id, order_ids, status
      FROM vendor_payout
      WHERE razorpay_payout_id IS NOT NULL
        AND TRIM(razorpay_payout_id) <> ''
        AND lower(coalesce(status, '')) IN ('pending', 'queued', 'processing')
        ${vendorId ? "AND vendor_id = $1" : ""}
      ORDER BY created_at ASC
      LIMIT ${vendorId ? "$2" : "$1"}
    `,
    vendorId ? [vendorId, limit] : [limit]
  )

  let settled = 0
  let markedPaid = 0

  for (const row of result.rows) {
    try {
      const remote = await getRazorpayPayout(row.razorpay_payout_id)
      const remoteStatus = String(remote?.status || "").toLowerCase()
      const orderIds = normalizePayoutOrderIds(row.order_ids)

      if (isRazorpayPayoutSettled(remoteStatus)) {
        await pool.query(
          `
            UPDATE vendor_payout
            SET
              status = 'processed',
              razorpay_status = $2,
              utr = COALESCE($3, utr),
              failure_reason = NULL,
              updated_at = NOW()
            WHERE id = $1
          `,
          [row.id, remoteStatus, remote?.utr || null]
        )
        settled += 1
        if (orderIds.length > 0) {
          markedPaid += await markVendorEarningsAsPaid(
            row.vendor_id,
            pool,
            orderIds
          )
        }
        continue
      }

      if (
        remoteStatus === "reversed" ||
        remoteStatus === "cancelled" ||
        remoteStatus === "rejected" ||
        remoteStatus === "failed"
      ) {
        await pool.query(
          `
            UPDATE vendor_payout
            SET
              status = $2,
              razorpay_status = $2,
              failure_reason = COALESCE($3, failure_reason),
              updated_at = NOW()
            WHERE id = $1
          `,
          [
            row.id,
            remoteStatus === "failed" ? "rejected" : remoteStatus,
            remote?.failure_reason || null,
          ]
        )
        continue
      }

      // Still pending/processing — keep local razorpay_status fresh
      if (remoteStatus && remoteStatus !== String(row.status || "").toLowerCase()) {
        await pool.query(
          `
            UPDATE vendor_payout
            SET razorpay_status = $2, updated_at = NOW()
            WHERE id = $1
          `,
          [row.id, remoteStatus]
        )
      }
    } catch (err: any) {
      console.warn(
        `[razorpay-sync] payout ${row.id} (${row.razorpay_payout_id}):`,
        err?.message || err
      )
    }
  }

  return { checked: result.rows.length, settled, markedPaid }
}
