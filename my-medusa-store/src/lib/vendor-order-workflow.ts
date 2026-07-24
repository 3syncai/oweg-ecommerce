import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

export type VendorOrderStage =
  | "to_accept"
  | "to_pack"
  | "to_dispatch"
  | "in_transit"
  | "delivered"

export type VendorShippingMethod = "easy" | "self"

export type VendorOrderWorkflow = {
  stage?: VendorOrderStage
  accepted_at?: string
  shipping_method?: VendorShippingMethod
  shiprocket_order_id?: string | null
  shiprocket_awb?: string | null
  shiprocket_status?: string | null
  self_courier_partner?: string | null
  self_tracking_source?: "shiprocket" | "carrier_api" | "manual" | null
  self_awb?: string | null
  self_dispatch_rate?: number | null
  self_packing_info?: string | null
  invoice_generated_at?: string
  rtd_at?: string
  updated_at?: string
}

type OrderLike = {
  id: string
  display_id?: string | number | null
  email?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  summary?: Record<string, any> | null
  currency_code?: string | null
  created_at?: string
  items?: any[]
  fulfillments?: any[]
  shipping_address?: any
  billing_address?: any
}

export function setVendorOrderCorsHeaders(res: MedusaResponse) {
  res.setHeader("Access-Control-Allow-Origin", process.env.VENDOR_CORS || "http://localhost:4000")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-publishable-api-key")
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export function getVendorWorkflows(metadata?: Record<string, unknown> | null) {
  const raw = metadata?.vendor_order_workflows
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? { ...(raw as Record<string, VendorOrderWorkflow>) }
    : {}
}

export function getVendorWorkflow(
  metadata: Record<string, unknown> | null | undefined,
  vendorId: string
): VendorOrderWorkflow {
  return { ...(getVendorWorkflows(metadata)[vendorId] || {}) }
}

export function mergeVendorWorkflowMetadata(
  metadata: Record<string, unknown> | null | undefined,
  vendorId: string,
  patch: VendorOrderWorkflow
) {
  const base = { ...(metadata || {}) }
  const workflows = getVendorWorkflows(base)
  workflows[vendorId] = {
    ...(workflows[vendorId] || {}),
    ...patch,
    updated_at: new Date().toISOString(),
  }
  return {
    ...base,
    vendor_order_workflows: workflows,
  }
}

export function normalizeTrackingStatus(status: unknown) {
  const normalized = String(status || "").trim().toLowerCase()
  if (!normalized) return ""
  if (normalized.includes("delivered")) return "delivered"
  if (normalized.includes("out for delivery")) return "out_for_delivery"
  if (normalized.includes("out for pickup")) return "pickup_scheduled"
  if (normalized.includes("transit")) return "in_transit"
  if (normalized.includes("picked up") || normalized.includes("pickup completed") || normalized.includes("pickup done")) {
    return "picked_up"
  }
  if (normalized.includes("shipped") || normalized.includes("dispatched")) return "shipped"
  if (
    normalized.includes("pickup scheduled") ||
    normalized.includes("pickup assigned") ||
    normalized.includes("pickup generated") ||
    normalized.includes("pickup requested")
  ) {
    return "pickup_scheduled"
  }
  if (normalized.includes("manifest")) return "manifested"
  if (normalized.includes("label")) return "label_generated"
  if (normalized.includes("ready to ship") || normalized.includes("ready_to_ship")) return "ready_to_ship"
  if (normalized.includes("created") || normalized.includes("booked")) return "created"
  if (normalized.includes("cancel")) return "cancelled"
  return normalized.replace(/\s+/g, "_")
}

export function isMovementTrackingStatus(status: string) {
  return ["in_transit", "out_for_delivery", "shipped", "picked_up"].includes(status)
}

export function isPreDispatchTrackingStatus(status: string) {
  return [
    "created",
    "booked",
    "manifested",
    "label_generated",
    "ready_to_ship",
    "pickup_scheduled",
  ].includes(status)
}

export function deriveFulfillmentStatus(order: OrderLike) {
  const fulfillments = order.fulfillments || []
  if (!fulfillments.length) return "pending"
  if (fulfillments.some((f) => f?.delivered_at)) return "delivered"
  if (fulfillments.some((f) => f?.shipped_at && !f?.canceled_at)) return "shipped"
  if (fulfillments.every((f) => f?.canceled_at)) return "canceled"
  return "processing"
}

export function deriveVendorStage(order: OrderLike, workflow: VendorOrderWorkflow): VendorOrderStage {
  const metadata = order.metadata || {}
  const status = normalizeTrackingStatus(
    workflow.shiprocket_status || metadata.shiprocket_status || workflow.stage || deriveFulfillmentStatus(order)
  )

  if (status === "delivered") return "delivered"
  if (isMovementTrackingStatus(status)) return "in_transit"
  if (isPreDispatchTrackingStatus(status) && workflow.rtd_at) return "to_dispatch"
  if (workflow.stage) return workflow.stage
  return "to_accept"
}

export function getVendorOrderStatusLabel(stage: VendorOrderStage) {
  if (stage === "to_accept") return "Pending"
  if (stage === "to_pack") return "Not packed"
  if (stage === "to_dispatch") return "Not shipped"
  if (stage === "in_transit") return "On the way"
  return "Delivered"
}

export function getPaymentType(order: OrderLike) {
  const metadata = order.metadata || {}
  const method = String(metadata.payment_method || metadata.payment_type || "").toLowerCase()
  return method === "cod" ? "PostPaid" : "Prepaid"
}

export function pickVendorItems(order: OrderLike, vendorProductIds: string[]) {
  const ids = new Set(vendorProductIds)
  return (order.items || []).filter((item) => {
    const productId = item.product_id || item.variant?.product_id
    return productId && ids.has(productId)
  })
}

export function formatVendorOrder(order: OrderLike, vendorId: string, vendorProductIds: string[]) {
  const vendorItems = pickVendorItems(order, vendorProductIds)
  const workflow = getVendorWorkflow(order.metadata, vendorId)
  const stage = deriveVendorStage(order, workflow)
  const total = vendorItems.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0)

  return {
    ...order,
    items: vendorItems,
    product_names: vendorItems.map((item) => item.title).filter(Boolean),
    total: total || (order.summary as any)?.current_order_total || 0,
    fulfillment_status: deriveFulfillmentStatus(order),
    vendor_stage: stage,
    vendor_status_label: getVendorOrderStatusLabel(stage),
    payment_type: getPaymentType(order),
    vendor_workflow: workflow,
  }
}

export async function getVendorProductIds(req: MedusaRequest, vendorId: string) {
  const query = req.scope.resolve("query")
  const { data: vendorProducts } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: {
      metadata: {
        vendor_id: vendorId,
      },
    },
  })

  return (vendorProducts || []).map((product: any) => product.id).filter(Boolean)
}

export async function getVendorOrderOrRespond(
  req: MedusaRequest,
  res: MedusaResponse,
  vendorId: string,
  orderId: string
) {
  const vendorProductIds = await getVendorProductIds(req, vendorId)
  if (!vendorProductIds.length) {
    res.status(404).json({ message: "Order not found for this vendor" })
    return null
  }

  const query = req.scope.resolve("query")
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "status",
      "is_draft_order",
      "metadata",
      "summary",
      "currency_code",
      "created_at",
      "updated_at",
      "customer_id",
      "shipping_address.*",
      "billing_address.*",
      "items.id",
      "items.title",
      "items.variant_title",
      "items.quantity",
      "items.unit_price",
      "items.product_id",
      "items.variant.product_id",
      "items.variant_sku",
      "fulfillments.id",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
      "fulfillments.canceled_at",
    ],
    filters: { id: orderId },
  })

  const order = data?.[0]
  if (!order || pickVendorItems(order, vendorProductIds).length === 0) {
    res.status(404).json({ message: "Order not found for this vendor" })
    return null
  }

  return { order, vendorProductIds }
}

export async function updateVendorOrderWorkflow(
  req: MedusaRequest,
  order: OrderLike,
  vendorId: string,
  patch: VendorOrderWorkflow
) {
  const orderModuleService = req.scope.resolve(Modules.ORDER)
  const metadata = mergeVendorWorkflowMetadata(order.metadata, vendorId, patch)
  await orderModuleService.updateOrders(order.id, { metadata })
  return metadata
}

export function buildShiprocketForwardPayload(order: OrderLike, vendorItems: any[], vendorId: string) {
  const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION
  if (!pickupLocation) {
    throw new Error("SHIPROCKET_PICKUP_LOCATION is required for forward shipments.")
  }

  const defaultLength = Number(process.env.SHIPROCKET_DEFAULT_LENGTH || 10)
  const defaultBreadth = Number(process.env.SHIPROCKET_DEFAULT_BREADTH || 10)
  const defaultHeight = Number(process.env.SHIPROCKET_DEFAULT_HEIGHT || 10)
  const defaultWeight = Number(process.env.SHIPROCKET_DEFAULT_WEIGHT || 0.5)
  const address = order.shipping_address || order.billing_address || {}
  const firstName = address.first_name || "Customer"
  const lastName = address.last_name || "Customer"
  const phoneDigits = String(address.phone || "").replace(/\D/g, "")
  const billingPhone = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits
  const subTotal = vendorItems.reduce(
    (sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0),
    0
  )

  return {
    order_id: `${order.id}-${vendorId.slice(-8)}`,
    order_date: new Date(order.created_at || Date.now()).toISOString(),
    pickup_location: pickupLocation,
    billing_customer_name: `${firstName} ${lastName}`.trim(),
    billing_first_name: firstName,
    billing_last_name: lastName,
    billing_address: address.address_1 || "",
    billing_address_2: address.address_2 || "",
    billing_city: address.city || "",
    billing_pincode: address.postal_code || "",
    billing_state: address.province || "",
    billing_country: String(address.country_code || "IN").toUpperCase(),
    billing_email: order.email || "",
    billing_phone: billingPhone,
    shipping_is_billing: true,
    length: defaultLength,
    breadth: defaultBreadth,
    height: defaultHeight,
    weight: defaultWeight,
    order_items: vendorItems.map((item) => ({
      name: item.title || "Item",
      sku: item.variant_sku || item.id || "SKU",
      units: item.quantity,
      selling_price: item.unit_price || 0,
    })),
    payment_method: getPaymentType(order) === "PostPaid" ? "COD" : "Prepaid",
    sub_total: subTotal,
  }
}

export function extractTrackingStatus(payload: any): string {
  const candidates = [
    payload?.current_status,
    payload?.status,
    payload?.tracking_data?.shipment_track?.[0]?.current_status,
    payload?.tracking_data?.shipment_track_activities?.[0]?.status,
    payload?.tracking_data?.shipment_track_activities?.[0]?.activity,
    payload?.data?.current_status,
    payload?.data?.status,
  ]

  return normalizeTrackingStatus(candidates.find(Boolean))
}

function humanizeTrackingStatus(status: string) {
  if (status === "delivered") return "Delivered"
  if (status === "out_for_delivery") return "Out for delivery"
  if (status === "in_transit") return "In transit"
  if (status === "picked_up") return "Picked up"
  if (status === "shipped") return "Shipped"
  if (status === "pickup_scheduled") return "Pickup scheduled"
  if (status === "manifested") return "Manifested"
  if (status === "label_generated") return "Label generated"
  if (status === "ready_to_ship") return "Ready to ship"
  if (status === "created") return "Created"
  if (status === "cancelled") return "Cancelled"
  if (status === "not_shipped") return "Not shipped"
  return status
    ? status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
    : "Not shipped"
}

export function extractTrackingEvents(payload: any) {
  const activities =
    payload?.tracking_data?.shipment_track_activities ||
    payload?.shipment_track_activities ||
    payload?.data?.shipment_track_activities ||
    payload?.data?.tracking_data?.shipment_track_activities ||
    []

  if (!Array.isArray(activities)) return []

  return activities.slice(0, 12).map((activity: any) => ({
    date: activity?.date || activity?.datetime || activity?.created_at || null,
    status: activity?.status || activity?.activity || activity?.current_status || null,
    location: activity?.location || activity?.city || null,
    activity: activity?.activity || activity?.status || null,
  }))
}

export function summarizeTrackingPayload(input: {
  provider: string
  courierPartnerName?: string | null
  awb?: string | null
  payload?: any
  status?: string
  error?: string | null
}) {
  const status = normalizeTrackingStatus(input.status || extractTrackingStatus(input.payload) || "not_shipped")
  const shipment = input.payload?.tracking_data?.shipment_track?.[0] || {}

  return {
    provider: input.provider,
    courier_partner_name:
      input.courierPartnerName ||
      shipment?.courier_name ||
      input.payload?.tracking_data?.courier_name ||
      null,
    awb: input.awb || shipment?.awb_code || null,
    status,
    status_label: humanizeTrackingStatus(status),
    source: input.payload ? "shiprocket" : "manual",
    error: input.error || null,
    checkpoints: extractTrackingEvents(input.payload),
  }
}
