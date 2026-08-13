import type { VendorOrderStage, VendorOrderWorkflow } from "./vendor-order-workflow"
import {
  isExceptionTrackingStatus,
  normalizeTrackingStatus,
} from "./vendor-order-workflow"

export type LogisticsStatusEvent = {
  status: string
  reason?: string | null
  /** When true, COD payout can unlock on cash_collected */
  isCodOrder?: boolean
}

export type LogisticsTransitionContext = {
  /** Current carrier status on the workflow */
  currentStatus?: string | null
  /** Current vendor stage */
  currentStage?: VendorOrderStage | string | null
  isCodOrder?: boolean
  alreadyCashCollected?: boolean
}

/**
 * Real-world rules (Indian courier):
 * - Prepaid never gets cash_collected
 * - After customer delivered → no NDR / RTO (parcel already with customer)
 * - NDR happens before successful delivery (attempt failed)
 * - RTO follows NDR / failed delivery, never after customer delivered
 * - COD cash_collected only on COD orders (usually after delivered)
 */
export function validateLogisticsTransition(
  nextStatusRaw: string,
  ctx: LogisticsTransitionContext
): { ok: true; status: string } | { ok: false; status: string; message: string } {
  const next = normalizeTrackingStatus(nextStatusRaw)
  const current = normalizeTrackingStatus(ctx.currentStatus || "")
  const stage = String(ctx.currentStage || "").toLowerCase()
  const customerDelivered = stage === "delivered" || current === "delivered"

  if (!next) {
    return { ok: false, status: next, message: "Missing or invalid status" }
  }

  if (next === "cash_collected") {
    if (!ctx.isCodOrder) {
      return {
        ok: false,
        status: next,
        message: "cash_collected is only valid for COD orders (this order is prepaid)",
      }
    }
    if (current === "rto_delivered" || current === "rto_initiated" || current === "rto_in_transit") {
      return {
        ok: false,
        status: next,
        message: "Cannot collect COD cash after RTO has started",
      }
    }
    return { ok: true, status: next }
  }

  if (next === "ndr") {
    if (customerDelivered) {
      return {
        ok: false,
        status: next,
        message: "NDR cannot happen after the order is already delivered to the customer",
      }
    }
    if (current === "rto_delivered") {
      return {
        ok: false,
        status: next,
        message: "NDR cannot happen after RTO is already completed",
      }
    }
    return { ok: true, status: next }
  }

  if (next === "rto_initiated" || next === "rto_in_transit" || next === "rto_delivered") {
    if (customerDelivered) {
      return {
        ok: false,
        status: next,
        message: "RTO cannot start after the parcel was delivered to the customer",
      }
    }
    return { ok: true, status: next }
  }

  if (next === "delivered") {
    if (current === "rto_initiated" || current === "rto_in_transit" || current === "rto_delivered") {
      return {
        ok: false,
        status: next,
        message: "Cannot mark customer-delivered after RTO has started",
      }
    }
    return { ok: true, status: next }
  }

  return { ok: true, status: next }
}

/**
 * Build vendor workflow patch for delivery / COD / NDR / RTO events.
 * Does not mark stage=delivered for RTO or NDR.
 */
export function buildLogisticsStatusPatch(
  event: LogisticsStatusEvent
): VendorOrderWorkflow & { should_schedule_earnings?: boolean } {
  const status = normalizeTrackingStatus(event.status)
  const now = new Date().toISOString()
  const reason = String(event.reason || "").trim().slice(0, 200) || null

  const patch: VendorOrderWorkflow & { should_schedule_earnings?: boolean } = {
    shiprocket_status: status || null,
  }

  if (status === "delivered") {
    patch.stage = "delivered"
    patch.shiprocket_delivered_at = now
    // Clear exception fields on a clean delivery
    patch.ndr_reason = null
    patch.ndr_at = null
    patch.rto_status = null
    patch.rto_at = null
    patch.cod_cash_collected_at = null
    // Prepaid: unlock now. COD: wait for cash_collected.
    patch.should_schedule_earnings = !event.isCodOrder
  } else if (status === "cash_collected") {
    patch.cod_cash_collected_at = now
    patch.should_schedule_earnings = Boolean(event.isCodOrder)
  } else if (status === "ndr") {
    patch.stage = "in_transit"
    patch.ndr_at = now
    patch.ndr_reason = reason || "delivery_attempt_failed"
    patch.shiprocket_delivered_at = null
  } else if (status === "rto_initiated" || status === "rto_in_transit" || status === "rto_delivered") {
    patch.stage = "in_transit"
    patch.rto_status = status
    patch.rto_at = now
    if (reason) patch.ndr_reason = reason
    patch.shiprocket_delivered_at = null
    patch.cod_cash_collected_at = null
  } else if (
    status === "in_transit" ||
    status === "out_for_delivery" ||
    status === "picked_up" ||
    status === "shipped"
  ) {
    patch.stage = "in_transit"
  }

  return patch
}

export function stageFromLogisticsStatus(status: string): VendorOrderStage | null {
  const normalized = normalizeTrackingStatus(status)
  if (normalized === "delivered") return "delivered"
  if (isExceptionTrackingStatus(normalized)) return "in_transit"
  if (
    normalized === "in_transit" ||
    normalized === "out_for_delivery" ||
    normalized === "picked_up" ||
    normalized === "shipped"
  ) {
    return "in_transit"
  }
  return null
}

export function normalizeNdrReason(raw?: string | null): string | null {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
  if (!value) return null
  if (value.includes("refuse") || value.includes("reject")) return "customer_refused"
  if (value.includes("not_available") || value.includes("unavailable") || value.includes("not available")) {
    return "customer_not_available"
  }
  if (value.includes("address")) return "address_issue"
  if (value.includes("payment") || value.includes("cod")) return "cod_payment_issue"
  return value.slice(0, 80)
}
