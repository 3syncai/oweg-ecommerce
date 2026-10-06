export type CancellationSource = "admin" | "customer"

export type CancellationInfo = {
  is_cancelled: boolean
  source: CancellationSource | null
  note: string | null
  customer_reason: string | null
  vendor_message: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancelled_by_label: string
}

const BLOCKED_SHIP_STATUSES = new Set([
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
])

export function readStringMeta(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function sanitizeCancelText(value: unknown, max = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

export function readCancellationInfo(
  order: { status?: string | null; metadata?: Record<string, unknown> | null } | null | undefined
): CancellationInfo {
  const status = String(order?.status || "").toLowerCase()
  const metadata = (order?.metadata || {}) as Record<string, unknown>
  const customerReason =
    readStringMeta(metadata, "customer_cancel_reason") ||
    readStringMeta(metadata, "cancellation_reason")

  // Never treat the customer reason as a vendor note. Legacy cancellation_note
  // is only a vendor message when it differs from the customer reason.
  const noteRaw = readStringMeta(metadata, "cancellation_note")
  const vendorMessage =
    readStringMeta(metadata, "vendor_cancel_message") ||
    readStringMeta(metadata, "admin_cancel_note") ||
    (noteRaw && noteRaw !== customerReason ? noteRaw : null)

  const sourceRaw = readStringMeta(metadata, "cancellation_source")
  const source: CancellationSource | null =
    sourceRaw === "admin" || metadata.cancelled_by_admin === true
      ? "admin"
      : sourceRaw === "customer"
        ? "customer"
        : customerReason || vendorMessage || status === "canceled" || status === "cancelled"
          ? "customer"
          : null

  const note = customerReason || vendorMessage
  const isCancelled = status === "canceled" || status === "cancelled"
  return {
    is_cancelled: isCancelled,
    source: isCancelled ? source : null,
    note,
    customer_reason: customerReason,
    vendor_message: vendorMessage,
    cancelled_at:
      readStringMeta(metadata, "cancellation_requested_at") ||
      readStringMeta(metadata, "cancelled_at"),
    cancelled_by: readStringMeta(metadata, "cancellation_requested_by"),
    cancelled_by_label: isCancelled
      ? source === "admin"
        ? "Admin cancelled this order"
        : "Customer cancelled this order"
      : "Not cancelled",
  }
}

/**
 * Stamp customer + vendor cancel messages onto order metadata.
 * When `forceAdminSource` is false (message-only PUT), preserve the original
 * cancellation_source so a customer cancel is never rewritten as admin.
 */
export function applyAdminCancellationMetadata(
  metadata: Record<string, unknown>,
  input: {
    customerReason: string
    vendorMessage: string
    adminId?: string | null
    keepCancelledAt?: boolean
    /** true = this is an admin-initiated cancel; false = attach messages only */
    forceAdminSource?: boolean
  }
) {
  const now = new Date().toISOString()
  const existingAt = readStringMeta(metadata, "cancellation_requested_at")
  const cancelledAt = input.keepCancelledAt && existingAt ? existingAt : now
  const forceAdmin = input.forceAdminSource !== false
  const existingSource = readStringMeta(metadata, "cancellation_source")
  const wasAdmin =
    existingSource === "admin" || metadata.cancelled_by_admin === true
  const source: CancellationSource = forceAdmin
    ? "admin"
    : wasAdmin
      ? "admin"
      : existingSource === "customer"
        ? "customer"
        : "customer"

  const next: Record<string, unknown> = {
    ...metadata,
    customer_cancel_reason: input.customerReason,
    vendor_cancel_message: input.vendorMessage,
    cancellation_reason: input.customerReason,
    // cancellation_note is vendor-facing only — never copy the customer reason here
    cancellation_note: input.vendorMessage || null,
    admin_cancel_note: input.vendorMessage || null,
    cancellation_source: source,
    cancelled_by_admin: source === "admin",
    cancelled_by: source === "admin" ? "admin" : "customer",
    cancellation_requested_at: cancelledAt,
    cancelled_at: cancelledAt,
  }

  if (forceAdmin || source === "admin") {
    next.cancellation_requested_by = input.adminId || metadata.cancellation_requested_by || "admin"
  }

  return next
}

export function isOrderCancellableByAdmin(order: {
  status?: string | null
  fulfillment_status?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const status = String(order.status || "").toLowerCase()
  if (status === "canceled" || status === "cancelled") return false
  const fulfillment = String(order.fulfillment_status || "").toLowerCase()
  if (fulfillment === "shipped" || fulfillment === "delivered") return false
  const shiprocket = String(
    (order.metadata as Record<string, unknown> | null | undefined)?.shiprocket_status || ""
  ).toLowerCase()
  if (BLOCKED_SHIP_STATUSES.has(shiprocket)) return false
  return true
}
