import { Modules } from "@medusajs/framework/utils"
import { getSharedDbPool } from "../lib/db-pool"
import { listCurrentOrderVendorIds } from "../lib/vendor-cancellation-scope"
import { withVendorOrderAssignmentLock } from "../lib/vendor-order-assignment-lock"
import { getVendorWorkflow, mergeVendorWorkflowMetadata } from "../lib/vendor-order-workflow"
import { acceptanceDeadline, isAcceptanceOverdue, reassignmentAcceptanceDeadline } from "../lib/vendor-acceptance-deadline"
import { isVendorVisibleOrder } from "../lib/vendor-order-visibility"
import { hasPasswordResetMailerConfig } from "../lib/password-reset/config"
import { sendTransactionalEmail } from "../lib/password-reset/mailer"

/** Mark overdue assignments and alert admin once; never reassign automatically. */
export default async function markOverdueVendorAcceptance(container: any) {
  const pool = getSharedDbPool()
  const logger = container.resolve("logger")
  // Recover orders whose placement event ran before the payment status became visible.
  const uninitialized = await pool.query<{ id: string }>(`
    SELECT id FROM "order"
    WHERE created_at > now() - interval '14 days'
      AND status NOT IN ('canceled','cancelled')
      AND metadata->>'vendor_acceptance_initialized' IS DISTINCT FROM 'true'
      AND (metadata->>'cod_status'='confirmed'
        OR metadata->>'cod_payment_status'='captured'
        OR metadata->>'razorpay_payment_status'='captured')
    ORDER BY updated_at DESC LIMIT 50`)
  for (const { id: orderId } of uninitialized.rows) {
    try {
      await withVendorOrderAssignmentLock(orderId, async () => {
        const orderModule = container.resolve(Modules.ORDER)
        const order: any = await orderModule.retrieveOrder(orderId)
        if (!isVendorVisibleOrder(order) || order.metadata?.vendor_acceptance_initialized === true) return
        const vendorIds = await listCurrentOrderVendorIds(orderId, pool)
        if (!vendorIds.length) return
        let metadata = { ...(order.metadata || {}) }
        for (const vendorId of vendorIds) {
          const workflow = getVendorWorkflow(metadata, vendorId)
          if (workflow.accepted_at || (workflow.stage && workflow.stage !== "to_accept")
            || workflow.acceptance_deadline_at) continue
          const reassigned = reassignmentAcceptanceDeadline(metadata, vendorId)
          const start = reassigned?.assigned_at || workflow.assigned_at || metadata.checkout_convert_authorized_at
            || metadata.cod_paid_at || order.created_at || new Date().toISOString()
          const assignedAt = new Date(start).toISOString()
          metadata = mergeVendorWorkflowMetadata(metadata, vendorId, {
            stage: "to_accept", assigned_at: assignedAt,
            acceptance_deadline_at: acceptanceDeadline(assignedAt),
          })
        }
        await orderModule.updateOrders(orderId, {
          metadata: { ...metadata, vendor_acceptance_initialized: true },
        })
      })
    } catch (error: any) {
      logger.warn(`[vendor-acceptance-init] order=${orderId}: ${error?.message}`)
    }
  }
  // Order edits can leave the reassignment history intact while losing the
  // replacement vendor's workflow. Recover it even when initial setup ran.
  const missingReassignments = await pool.query<{ id: string }>(`
    SELECT DISTINCT o.id FROM "order" o
    JOIN order_item oi ON oi.order_id=o.id AND oi.version=o.version AND oi.deleted_at IS NULL
    JOIN order_line_item oli ON oli.id=oi.item_id AND oli.deleted_at IS NULL
    LEFT JOIN product_variant pv ON pv.id=oli.variant_id
    JOIN product p ON p.id=COALESCE(oli.product_id,pv.product_id)
    JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.metadata->'vendor_reassignment_history')='array'
        THEN o.metadata->'vendor_reassignment_history' ELSE '[]'::jsonb END
    ) history ON history->>'to_vendor_id'=p.metadata->>'vendor_id'
    WHERE o.status NOT IN ('canceled','cancelled') AND COALESCE(oi.quantity,0)>0
      AND NULLIF(history->>'at','') IS NOT NULL
      AND (o.metadata->'vendor_order_workflows'->(history->>'to_vendor_id')->>'acceptance_deadline_at') IS NULL
      AND (o.metadata->'vendor_order_workflows'->(history->>'to_vendor_id')->>'accepted_at') IS NULL
      AND COALESCE(o.metadata->'vendor_order_workflows'->(history->>'to_vendor_id')->>'stage','to_accept')='to_accept'
    ORDER BY o.id LIMIT 50`)
  for (const { id: orderId } of missingReassignments.rows) {
    try {
      await withVendorOrderAssignmentLock(orderId, async () => {
        const orderModule = container.resolve(Modules.ORDER)
        const order: any = await orderModule.retrieveOrder(orderId)
        if (!isVendorVisibleOrder(order)) return
        const vendorIds = await listCurrentOrderVendorIds(orderId, pool)
        let metadata = { ...(order.metadata || {}) }
        let changed = false
        for (const vendorId of vendorIds) {
          const workflow = getVendorWorkflow(metadata, vendorId)
          if (workflow.acceptance_deadline_at || workflow.accepted_at ||
            (workflow.stage && workflow.stage !== "to_accept")) continue
          const recovered = reassignmentAcceptanceDeadline(metadata, vendorId)
          if (!recovered) continue
          metadata = mergeVendorWorkflowMetadata(metadata, vendorId, {
            stage: "to_accept", ...recovered,
          })
          changed = true
        }
        if (changed) await orderModule.updateOrders(orderId, { metadata })
      })
    } catch (error: any) {
      logger.warn(`[vendor-acceptance-reassignment-recovery] order=${orderId}: ${error?.message}`)
    }
  }
  const pending = await pool.query<{ id: string }>(`
    SELECT id FROM "order" WHERE status NOT IN ('canceled','cancelled')
      AND EXISTS (
        SELECT 1 FROM jsonb_each(
          CASE WHEN jsonb_typeof(metadata->'vendor_order_workflows')='object'
            THEN metadata->'vendor_order_workflows' ELSE '{}'::jsonb END
        ) AS workflow WHERE (workflow.value->>'acceptance_deadline_at')::timestamptz <= now()
          AND workflow.value->>'accepted_at' IS NULL
          AND COALESCE(workflow.value->>'stage','to_accept')='to_accept'
          AND workflow.value->>'acceptance_alert_sent_at' IS NULL
          AND workflow.value->>'acceptance_alert_unavailable_at' IS NULL
      ) ORDER BY updated_at ASC LIMIT 50`)

  for (const { id: orderId } of pending.rows) {
    try {
      await withVendorOrderAssignmentLock(orderId, async () => {
        const orderModule = container.resolve(Modules.ORDER)
        const order: any = await orderModule.retrieveOrder(orderId)
        if (["canceled", "cancelled"].includes(String(order.status).toLowerCase())) return
        const currentVendorIds = await listCurrentOrderVendorIds(orderId, pool)
        let metadata = { ...(order.metadata || {}) }
        for (const vendorId of currentVendorIds) {
          const workflow = getVendorWorkflow(metadata, vendorId)
          if (!isAcceptanceOverdue(workflow) || workflow.acceptance_alert_sent_at
            || workflow.acceptance_alert_unavailable_at) continue
          metadata = mergeVendorWorkflowMetadata(metadata, vendorId, {
            acceptance_timed_out_at: workflow.acceptance_timed_out_at || new Date().toISOString(),
          })
          await orderModule.updateOrders(orderId, { metadata })
          const alertEmail = process.env.VENDOR_ASSIGNMENT_ALERT_EMAIL?.trim()
          if (!alertEmail || !hasPasswordResetMailerConfig()) {
            metadata = mergeVendorWorkflowMetadata(metadata, vendorId, {
              acceptance_alert_unavailable_at: new Date().toISOString(),
            })
            await orderModule.updateOrders(orderId, { metadata })
            continue
          }
          await sendTransactionalEmail({
            to: alertEmail,
            subject: `Vendor acceptance overdue for order #${order.display_id || orderId}`,
            heading: "Vendor acceptance overdue",
            intro: `Vendor ${vendorId} has not accepted order #${order.display_id || orderId} within 48 hours.`,
            paragraphs: ["Review the order in admin and reassign it to an available vendor or cancel it if no alternative is suitable."],
          })
          metadata = mergeVendorWorkflowMetadata(metadata, vendorId, {
            acceptance_alert_sent_at: new Date().toISOString(),
          })
          await orderModule.updateOrders(orderId, { metadata })
        }
      })
    } catch (error: any) {
      logger.warn(`[vendor-acceptance-overdue] order=${orderId}: ${error?.message}`)
    }
  }
}

export const config = { name: "mark-overdue-vendor-acceptance", schedule: "*/10 * * * *" }
