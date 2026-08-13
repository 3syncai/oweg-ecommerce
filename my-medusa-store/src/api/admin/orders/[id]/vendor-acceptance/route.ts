import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../../../modules/vendor"
import VendorModuleService from "../../../../../modules/vendor/service"
import {
  deriveVendorStage,
  getAdminVendorAcceptanceLabel,
  getVendorOrderStatusLabel,
  getVendorWorkflow,
  getVendorWorkflows,
  isVendorAccepted,
  pickVendorItems,
  type VendorOrderStage,
} from "../../../../../lib/vendor-order-workflow"

/**
 * GET /admin/orders/:id/vendor-acceptance
 * Vendor acceptance / fulfillment status for admin order details.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const orderId = req.params?.id as string
    if (!orderId) {
      return res.status(400).json({ message: "Order id is required" })
    }

    const query = req.scope.resolve("query")
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "metadata",
        "status",
        "created_at",
        "items.id",
        "items.title",
        "items.quantity",
        "items.product_id",
        "items.variant.product_id",
        "items.variant_sku",
        "items.variant_title",
        "fulfillments.id",
        "fulfillments.shipped_at",
        "fulfillments.delivered_at",
        "fulfillments.canceled_at",
      ],
      filters: { id: orderId },
    })

    const order = data?.[0]
    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const items = Array.isArray(order.items) ? order.items : []
    const productIds = Array.from(
      new Set(
        items
          .map((item: any) => item.product_id || item.variant?.product_id)
          .filter(Boolean)
      )
    ) as string[]

    const productById = new Map<string, any>()
    if (productIds.length) {
      const { data: products } = await query.graph({
        entity: "product",
        fields: ["id", "title", "metadata"],
        filters: { id: productIds },
      })
      for (const product of products || []) {
        if (product?.id) productById.set(product.id, product)
      }
    }

    const vendorProductIds = new Map<string, string[]>()
    for (const productId of productIds) {
      const product = productById.get(productId)
      const vendorId = String(product?.metadata?.vendor_id || "").trim()
      if (!vendorId) continue
      const list = vendorProductIds.get(vendorId) || []
      list.push(productId)
      vendorProductIds.set(vendorId, list)
    }

    const workflows = getVendorWorkflows(order.metadata as Record<string, unknown>)
    const vendorIds = Array.from(
      new Set([...Object.keys(workflows), ...vendorProductIds.keys()])
    )

    const vendorService = req.scope.resolve(VENDOR_MODULE) as VendorModuleService
    const vendors: Array<Record<string, unknown>> = []

    for (const vendorId of vendorIds) {
      const productIdsForVendor = vendorProductIds.get(vendorId) || []
      const workflow = getVendorWorkflow(order.metadata as Record<string, unknown>, vendorId)
      const stage = deriveVendorStage(order as any, workflow) as VendorOrderStage
      const vendorItems = pickVendorItems(order as any, productIdsForVendor)

      let vendorProfile: any = null
      try {
        vendorProfile = await vendorService.retrieveVendor(vendorId)
      } catch {
        vendorProfile = null
      }

      const accepted = isVendorAccepted(workflow)
      vendors.push({
        vendor_id: vendorId,
        vendor_name:
          workflow.vendor_name ||
          vendorProfile?.name ||
          null,
        store_name:
          workflow.store_name ||
          vendorProfile?.store_name ||
          null,
        vendor_email:
          workflow.vendor_email ||
          vendorProfile?.email ||
          null,
        vendor_phone: vendorProfile?.phone || vendorProfile?.telephone || null,
        accepted,
        acceptance_label: getAdminVendorAcceptanceLabel(workflow, stage),
        stage,
        stage_label: getVendorOrderStatusLabel(stage),
        can_mark_delivered: stage !== "delivered",
        accepted_at: workflow.accepted_at || null,
        shipping_method: workflow.shipping_method || null,
        shipping_provider: workflow.shipping_provider || null,
        easy_courier_partner: workflow.easy_courier_partner || null,
        self_courier_partner: workflow.self_courier_partner || null,
        self_awb: workflow.self_awb || null,
        shiprocket_awb: workflow.shiprocket_awb || null,
        shiprocket_status: workflow.shiprocket_status || null,
        tracking_number: workflow.tracking_number || null,
        tracking_url: workflow.tracking_url || null,
        label_url: workflow.label_url || null,
        invoice_generated_at: workflow.invoice_generated_at || null,
        rtd_at: workflow.rtd_at || null,
        updated_at: workflow.updated_at || null,
        items: vendorItems.map((item: any) => ({
          id: item.id,
          title: item.title,
          variant_title: item.variant_title,
          sku: item.variant_sku,
          quantity: item.quantity,
          product_id: item.product_id || item.variant?.product_id || null,
        })),
        item_count: vendorItems.length,
      })
    }

    vendors.sort((a, b) => {
      const aAccepted = a.accepted ? 1 : 0
      const bAccepted = b.accepted ? 1 : 0
      if (aAccepted !== bAccepted) return bAccepted - aAccepted
      return String(a.store_name || a.vendor_name || "").localeCompare(
        String(b.store_name || b.vendor_name || "")
      )
    })

    const acceptedCount = vendors.filter((v) => v.accepted).length
    const pendingCount = vendors.length - acceptedCount

    return res.json({
      order_id: order.id,
      display_id: order.display_id,
      vendors,
      summary: {
        vendor_count: vendors.length,
        accepted_count: acceptedCount,
        pending_count: pendingCount,
        all_accepted: vendors.length > 0 && pendingCount === 0,
        any_accepted: acceptedCount > 0,
        status_label:
          vendors.length === 0
            ? "No vendor linked"
            : pendingCount === 0
              ? "Accepted by all vendors"
              : acceptedCount === 0
                ? "Awaiting vendor acceptance"
                : `Accepted by ${acceptedCount}/${vendors.length} vendors`,
      },
    })
  } catch (error: any) {
    console.error("[admin vendor-acceptance]", error)
    return res.status(500).json({
      message: error?.message || "Failed to load vendor acceptance",
    })
  }
}
