import { Modules } from "@medusajs/framework/utils"
import { getSharedDbPool } from "../lib/db-pool"
import { withVendorOrderAssignmentLock } from "../lib/vendor-order-assignment-lock"
import { chargeVendorRelocationCancellation, reverseVendorEarningsForOrder } from "../lib/vendor-earnings"
import type { VendorSettlementRatesSnapshot } from "../lib/vendor-settlement-snapshot"

/** Finish financial debits when an order edit or cancellation succeeded but ledger writing failed. */
export default async function reconcileVendorCancellationCharges(container: any) {
  const logger = container.resolve("logger")
  const pool = getSharedDbPool()
  const pending = await pool.query<{ id: string }>(`
    SELECT id FROM "order"
    WHERE metadata->>'admin_cancel_charge_status' = 'pending'
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(metadata->'vendor_reassignment_history')='array'
             THEN metadata->'vendor_reassignment_history' ELSE '[]'::jsonb END
         ) AS entry WHERE entry->>'vendor_cancellation_charge_status'='pending'
       )
    ORDER BY updated_at ASC LIMIT 50`)

  for (const { id: orderId } of pending.rows) {
    try {
      await withVendorOrderAssignmentLock(orderId, async () => {
        const orderModule = container.resolve(Modules.ORDER)
        let order: any = await orderModule.retrieveOrder(orderId)
        let metadata: Record<string, any> = { ...(order.metadata || {}) }
        const history: any[] = Array.isArray(metadata.vendor_reassignment_history)
          ? [...metadata.vendor_reassignment_history] : []

        for (let index = 0; index < history.length; index++) {
          const entry = history[index]
          if (entry?.vendor_cancellation_charge_status !== "pending") continue
          if (!entry.from_vendor_id) continue
          const rates = entry.vendor_cancellation_charge_rates as VendorSettlementRatesSnapshot | undefined
          await chargeVendorRelocationCancellation(orderId, String(entry.from_vendor_id), pool, {
            orderMetadata: metadata, frozenRates: rates,
          })
          history[index] = {
            ...entry,
            vendor_cancellation_charge_status: Number(rates?.cancellation_charge || 0) > 0 ? "recorded" : "waived",
          }
          metadata.vendor_reassignment_history = history
          await orderModule.updateOrders(orderId, { metadata })
        }

        // The vendor IDs were captured before cancelOrderWorkflow changed the order.
        order = await orderModule.retrieveOrder(orderId)
        metadata = { ...(order.metadata || {}) }
        if (metadata.admin_cancel_charge_status === "pending"
          && ["canceled", "cancelled"].includes(String(order.status).toLowerCase())) {
          const vendorIds = Array.isArray(metadata.admin_cancel_vendor_ids)
            ? metadata.admin_cancel_vendor_ids.filter((id: unknown): id is string => typeof id === "string" && Boolean(id))
            : []
          if (vendorIds.length) {
            await reverseVendorEarningsForOrder(orderId, pool, "admin-cancelled", {
              vendorIds, vendorScoped: true, applyCancellationCharge: true,
            })
          }
          metadata.admin_cancel_charge_status = "recorded"
          await orderModule.updateOrders(orderId, { metadata })
        }
      })
    } catch (error: any) {
      logger.warn(`[cancellation-charge-reconcile] order=${orderId}: ${error?.message}`)
    }
  }
}

export const config = { name: "reconcile-vendor-cancellation-charges", schedule: "*/10 * * * *" }
