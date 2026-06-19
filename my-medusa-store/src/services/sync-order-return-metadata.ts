import { Modules } from "@medusajs/framework/utils"

type ReturnMetadataPatch = {
  id: string
  type: string
  status: string
  reason?: string | null
  created_at?: string | Date | null
}

export async function syncOrderReturnMetadata(
  scope: { resolve: (key: string) => unknown },
  orderId: string,
  patch: ReturnMetadataPatch
) {
  if (!orderId || !patch?.id) return

  const orderModuleService = scope.resolve(Modules.ORDER) as {
    retrieveOrder: (id: string) => Promise<{ id: string; metadata?: Record<string, unknown> | null }>
    updateOrders: (id: string, data: { metadata: Record<string, unknown> }) => Promise<unknown>
  }

  const order = await orderModuleService.retrieveOrder(orderId)
  const existing = (order.metadata || {}) as Record<string, unknown>
  const requestedAt =
    typeof patch.created_at === "string"
      ? patch.created_at
      : patch.created_at instanceof Date
        ? patch.created_at.toISOString()
        : typeof existing.return_requested_at === "string"
          ? existing.return_requested_at
          : new Date().toISOString()

  await orderModuleService.updateOrders(orderId, {
    metadata: {
      ...existing,
      return_request_id: patch.id,
      return_request_type: patch.type,
      return_request_status: patch.status,
      return_request_reason: patch.reason ?? null,
      return_requested_at: requestedAt,
      return_status_updated_at: new Date().toISOString(),
    },
  })
}
