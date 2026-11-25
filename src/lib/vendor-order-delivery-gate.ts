type VendorWorkflow = Record<string, unknown>

function isVendorWorkflowDelivered(workflow: VendorWorkflow | null | undefined): boolean {
  if (!workflow || typeof workflow !== "object") return false
  if (String(workflow.stage || "").toLowerCase() === "delivered") return true
  const deliveredMarkers = [
    workflow.shiprocket_delivered_at,
    workflow.self_delivered_at,
    workflow.delivered_at,
  ]
  return deliveredMarkers.some((value) => {
    if (value == null) return false
    if (typeof value === "string") return value.trim().length > 0
    return true
  })
}

/**
 * Multi-vendor carts: coins / affiliates unlock only after every vendor workflow
 * on the order is delivered. Single-vendor (or legacy metadata) orders pass through.
 */
export function canAwardOrderLevelRewards(metadata: unknown): {
  allowed: boolean
  reason?: string
  pending_vendor_ids?: string[]
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { allowed: true }
  }
  const raw = (metadata as Record<string, unknown>).vendor_order_workflows
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { allowed: true }
  }
  const entries = Object.entries(raw as Record<string, VendorWorkflow>)
  if (entries.length <= 1) {
    return { allowed: true }
  }
  const pending = entries
    .filter(([, workflow]) => !isVendorWorkflowDelivered(workflow))
    .map(([vendorId]) => vendorId)
  if (pending.length) {
    return {
      allowed: false,
      reason: "waiting_for_sibling_vendors",
      pending_vendor_ids: pending,
    }
  }
  return { allowed: true }
}
