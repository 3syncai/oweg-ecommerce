import type { MedusaRequest } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import ReturnModuleService from "../modules/returns/service"
import { RETURN_MODULE } from "../modules/returns"
import { getEasyShipProvider } from "../services/easy-ship"
import { syncOrderReturnMetadata } from "../services/sync-order-return-metadata"
import { getVendorWorkflow, getVendorWorkflows } from "./vendor-order-workflow"
import {
  buildVendorPickupAddress,
  estimatePackageFromVendorItems,
  retrieveVendorOrThrow,
} from "./vendor-shiprocket-pickup"

export type ReverseCourierSelection = {
  reverse_courier_id: number
  reverse_courier_name: string
  reverse_courier_selected_at: string
  reverse_shipping_method: "easy"
}

export type NormalizedCourier = {
  courier_id: number
  courier_name: string
  rate: number | null
  etd: string | number | null
  freight_charge: number | null
  rto_charges: number | null
  cod_charges: number | null
  charge_weight: number | null
  cod: boolean
  is_surface: boolean
  rating: number | null
}

function normalizePhone(value?: string | null) {
  if (!value) return ""
  const digits = value.replace(/\D/g, "")
  if (digits.length <= 10) return digits
  return digits.slice(-10)
}

export function normalizeCouriers(raw: Record<string, unknown>): NormalizedCourier[] {
  const data = (raw?.data || raw) as Record<string, any>
  const list =
    data?.available_courier_companies ||
    data?.couriers ||
    data?.recommended_courier_company ||
    []

  const companies = Array.isArray(list) ? list : list ? [list] : []

  return companies
    .map((c: any) => {
      const id = Number(c?.courier_company_id ?? c?.id ?? c?.courier_id)
      const name = String(c?.courier_name || c?.name || "").trim()
      if (!Number.isFinite(id) || id <= 0 || !name) return null
      return {
        courier_id: id,
        courier_name: name,
        rate: c?.rate != null ? Number(c.rate) : null,
        etd: c?.etd || c?.estimated_delivery_days || c?.edd || null,
        freight_charge: c?.freight_charge != null ? Number(c.freight_charge) : null,
        rto_charges: c?.rto_charges != null ? Number(c.rto_charges) : null,
        cod_charges: c?.cod_charges != null ? Number(c.cod_charges) : null,
        charge_weight: c?.charge_weight != null ? Number(c.charge_weight) : null,
        cod: Boolean(c?.cod),
        is_surface: Boolean(c?.is_surface),
        rating: c?.rating != null ? Number(c.rating) : null,
      } as NormalizedCourier
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ar = a!.rate == null ? Number.POSITIVE_INFINITY : a!.rate
      const br = b!.rate == null ? Number.POSITIVE_INFINITY : b!.rate
      return ar - br
    }) as NormalizedCourier[]
}

export function getReturnMetadata(request: any): Record<string, any> {
  const meta = request?.metadata
  return meta && typeof meta === "object" && !Array.isArray(meta) ? { ...meta } : {}
}

export function getReverseCourierSelection(request: any): ReverseCourierSelection | null {
  const meta = getReturnMetadata(request)
  const id = Number(meta.reverse_courier_id)
  const name = String(meta.reverse_courier_name || "").trim()
  if (!Number.isFinite(id) || id <= 0 || !name) return null
  return {
    reverse_courier_id: id,
    reverse_courier_name: name,
    reverse_courier_selected_at: String(meta.reverse_courier_selected_at || ""),
    reverse_shipping_method: "easy",
  }
}

export function isVendorEasyShipOrder(order: any, vendorId: string): boolean {
  const workflow = getVendorWorkflow(order?.metadata || null, vendorId)
  return workflow.shipping_method === "easy"
}

export function isVendorSelfShipOrder(order: any, vendorId: string): boolean {
  const workflow = getVendorWorkflow(order?.metadata || null, vendorId)
  return workflow.shipping_method === "self"
}

export function getSelfReverseTracking(request: any): {
  reverse_tracking_number: string | null
  reverse_tracking_url: string | null
  reverse_label_url: string | null
  reverse_courier_partner: string | null
  reverse_tracking_saved_at: string | null
} {
  const meta = getReturnMetadata(request)
  return {
    reverse_tracking_number: meta.reverse_tracking_number
      ? String(meta.reverse_tracking_number)
      : null,
    reverse_tracking_url: meta.reverse_tracking_url
      ? String(meta.reverse_tracking_url)
      : null,
    reverse_label_url: meta.reverse_label_url ? String(meta.reverse_label_url) : null,
    reverse_courier_partner: meta.reverse_courier_partner
      ? String(meta.reverse_courier_partner)
      : null,
    reverse_tracking_saved_at: meta.reverse_tracking_saved_at
      ? String(meta.reverse_tracking_saved_at)
      : null,
  }
}

/** Resolve forward shipping method used on the original order (for this vendor). */
export function resolveVendorForwardShippingMethod(
  order: any,
  vendorId: string
): "easy" | "self" | null {
  const workflow = getVendorWorkflow(order?.metadata || null, vendorId)
  if (workflow.shipping_method === "easy" || workflow.shipping_method === "self") {
    return workflow.shipping_method
  }
  return null
}

/** Best-effort shipping method for admin (any vendor workflow on the order). */
export function resolveOrderReturnShippingContext(order: any, request: any) {
  const meta = getReturnMetadata(request)
  const selfTracking = getSelfReverseTracking(request)
  const selection = getReverseCourierSelection(request)

  if (meta.reverse_shipping_method === "easy" || meta.reverse_shipping_method === "self") {
    return {
      shipping_method: meta.reverse_shipping_method as "easy" | "self",
      reverse_courier_id: selection?.reverse_courier_id ?? meta.reverse_courier_id ?? null,
      reverse_courier_name:
        selection?.reverse_courier_name ?? meta.reverse_courier_name ?? null,
      reverse_courier_rate:
        meta.reverse_courier_rate != null ? Number(meta.reverse_courier_rate) : null,
      ...selfTracking,
    }
  }

  const workflows =
    order?.metadata?.vendor_order_workflows &&
    typeof order.metadata.vendor_order_workflows === "object"
      ? (order.metadata.vendor_order_workflows as Record<string, any>)
      : {}

  const vendorId = meta.reverse_vendor_id ? String(meta.reverse_vendor_id) : null
  if (vendorId && workflows[vendorId]?.shipping_method) {
    const method = workflows[vendorId].shipping_method
    return {
      shipping_method: method === "easy" ? "easy" : method === "self" ? "self" : null,
      reverse_courier_id: selection?.reverse_courier_id ?? meta.reverse_courier_id ?? null,
      reverse_courier_name:
        selection?.reverse_courier_name ?? meta.reverse_courier_name ?? null,
      reverse_courier_rate:
        meta.reverse_courier_rate != null ? Number(meta.reverse_courier_rate) : null,
      ...selfTracking,
    }
  }

  for (const wf of Object.values(workflows)) {
    if (wf?.shipping_method === "easy" || wf?.shipping_method === "self") {
      return {
        shipping_method: wf.shipping_method as "easy" | "self",
        reverse_courier_id: selection?.reverse_courier_id ?? meta.reverse_courier_id ?? null,
        reverse_courier_name:
          selection?.reverse_courier_name ?? meta.reverse_courier_name ?? null,
        reverse_courier_rate:
          meta.reverse_courier_rate != null ? Number(meta.reverse_courier_rate) : null,
        ...selfTracking,
      }
    }
  }

  return {
    shipping_method: null as "easy" | "self" | null,
    reverse_courier_id: selection?.reverse_courier_id ?? meta.reverse_courier_id ?? null,
    reverse_courier_name:
      selection?.reverse_courier_name ?? meta.reverse_courier_name ?? null,
    reverse_courier_rate:
      meta.reverse_courier_rate != null ? Number(meta.reverse_courier_rate) : null,
    ...selfTracking,
  }
}

export async function resolveVendorOwnedReturn(
  req: MedusaRequest,
  vendorId: string,
  returnRequestId: string
) {
  const query = req.scope.resolve("query")
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)

  const requests = await returnService.listReturnRequests({ id: returnRequestId })
  if (!requests?.length) {
    return { error: { status: 404, message: "Return request not found" } as const }
  }
  const request = requests[0]

  const { data: vendorProducts } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { metadata: { vendor_id: vendorId } },
  })
  const vendorProductIds = new Set((vendorProducts || []).map((p: any) => p.id))

  const { data: ordersData } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "metadata",
      "items.id",
      "items.title",
      "items.quantity",
      "items.product_id",
      "items.variant.product_id",
      "items.variant.sku",
      "items.unit_price",
      "shipping_address.*",
      "billing_address.*",
    ],
    filters: { id: request.order_id },
  })

  const order = ordersData?.[0]
  if (!order) {
    return { error: { status: 404, message: "Order not found for return" } as const }
  }

  const belongs = (order.items || []).some((item: any) => {
    const productId = item.product_id || item.variant?.product_id
    return productId && vendorProductIds.has(productId)
  })
  if (!belongs) {
    return { error: { status: 403, message: "Return does not belong to this vendor" } as const }
  }

  return {
    request,
    order,
    vendorProductIds,
    returnService,
  }
}

export async function initiateEasyShipReversePickup(params: {
  req: MedusaRequest
  returnRequestId: string
  vendorId: string
  reason?: string
  courierOverride?: {
    courier_id: number
    courier_name: string
    courier_rate?: number
  }
  bookedBy?: "admin" | "vendor"
}): Promise<{ return_request: any; shiprocket: any; provider: string }> {
  const { req, returnRequestId, vendorId, reason, courierOverride, bookedBy } = params
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const orderModuleService = req.scope.resolve(Modules.ORDER)
  const provider = getEasyShipProvider()

  const requests = await returnService.listReturnRequests({ id: returnRequestId })
  if (!requests.length) {
    throw new Error("Return request not found.")
  }
  const request = requests[0]
  if (request.status !== "approved") {
    throw new Error("Pickup can only be initiated after approval.")
  }
  if (request.shiprocket_order_id || request.pickup_initiated_at) {
    return { return_request: request, shiprocket: null, provider: provider.name }
  }

  let selection = getReverseCourierSelection(request)
  if (courierOverride) {
    selection = {
      reverse_courier_id: courierOverride.courier_id,
      reverse_courier_name: courierOverride.courier_name,
      reverse_courier_selected_at: new Date().toISOString(),
      reverse_shipping_method: "easy",
    }
  } else if (!selection) {
    throw new Error(
      `Select a ${provider.displayName} reverse courier before initiating Easy Ship pickup.`
    )
  }

  const order = await orderModuleService.retrieveOrder(request.order_id, {
    relations: ["items", "shipping_address", "billing_address"],
  })

  if (!isVendorEasyShipOrder(order, vendorId)) {
    throw new Error("Easy Ship reverse pickup is only available for Easy Ship orders.")
  }

  const vendor = await retrieveVendorOrThrow(req, vendorId)
  const warehouse = buildVendorPickupAddress(vendor)
  const returnItems = await returnService.listReturnRequestItems({
    return_request_id: request.id,
  })
  const orderItems = order.items || []

  const vendorItems = orderItems.filter((item: any) => {
    const productId = item.product_id || item.variant?.product_id
    return Boolean(productId)
  })
  const pkg = await estimatePackageFromVendorItems(req, vendorItems)

  const firstName = order.shipping_address?.first_name || "Customer"
  const lastName = order.shipping_address?.last_name || "Customer"
  const pickupPhone = normalizePhone(order.shipping_address?.phone || "")
  const pickupReason = reason?.trim() || request.reason || ""

  const payload: Record<string, unknown> = {
    order_id: `return_${request.id}`,
    order_date: new Date().toISOString(),
    pickup_customer_name: `${firstName} ${lastName}`.trim(),
    pickup_first_name: firstName,
    pickup_last_name: lastName,
    pickup_address: order.shipping_address?.address_1 || "",
    pickup_address_2: order.shipping_address?.address_2 || "",
    pickup_city: order.shipping_address?.city || "",
    pickup_state: order.shipping_address?.province || "",
    pickup_country: order.shipping_address?.country_code || "IN",
    pickup_pincode: order.shipping_address?.postal_code || "",
    pickup_email: order.email || "",
    pickup_phone: pickupPhone,
    shipping_is_billing: true,
    shipping_customer_name: warehouse.name,
    shipping_address: warehouse.address,
    shipping_address_2: warehouse.address_2 || "",
    shipping_city: warehouse.city,
    shipping_state: warehouse.state,
    shipping_country: warehouse.country,
    shipping_pincode: warehouse.pin_code,
    shipping_phone: warehouse.phone,
    shipping_email: warehouse.email,
    length: pkg.length,
    breadth: pkg.breadth,
    height: pkg.height,
    weight: pkg.weight,
    courier_id: selection.reverse_courier_id,
    courier_name: selection.reverse_courier_name,
    order_items: returnItems.map((item: any) => {
      const original = orderItems.find((orderItem: any) => orderItem.id === item.order_item_id) as any
      return {
        name: original?.title || "Return Item",
        sku: original?.variant_sku || original?.variant?.sku || original?.id || "SKU",
        units: item.quantity,
        selling_price: original?.unit_price || 0,
      }
    }),
    payment_method: "Prepaid",
    sub_total: returnItems.reduce((sum: number, item: any) => {
      const original = orderItems.find((orderItem: any) => orderItem.id === item.order_item_id) as any
      return sum + (original?.unit_price || 0) * item.quantity
    }, 0),
    ...(pickupReason ? { reason: pickupReason } : {}),
  }

  console.log(
    `[Return] Easy Ship reverse pickup for ${request.id} via ${provider.displayName} courier ${selection.reverse_courier_id}`
  )
  const created = await provider.createReversePickup(payload)

  const shiprocketOrderId =
    created.order_id !== null && created.order_id !== undefined
      ? String(created.order_id)
      : null
  const shiprocketAwb =
    created.awb !== null && created.awb !== undefined ? String(created.awb) : null

  const meta = getReturnMetadata(request)
  const nowIso = new Date().toISOString()
  const updated = await returnService.updateReturnRequests({
    id: request.id,
    shiprocket_order_id: shiprocketOrderId,
    shiprocket_awb: shiprocketAwb,
    shiprocket_status: "pickup_initiated",
    metadata: {
      ...meta,
      reverse_shipping_method: "easy",
      reverse_shipping_provider: provider.name,
      reverse_pickup_destination: "vendor",
      reverse_vendor_id: vendorId,
      reverse_tracking_url: created.tracking_url || null,
      reverse_courier_id: selection.reverse_courier_id,
      reverse_courier_name: selection.reverse_courier_name,
      reverse_courier_rate:
        courierOverride?.courier_rate != null
          ? courierOverride.courier_rate
          : meta.reverse_courier_rate,
      reverse_courier_selected_at: selection.reverse_courier_selected_at || nowIso,
      return_admin_booking_status: "booked",
      admin_return_booked_at: nowIso,
      return_booked_by: bookedBy || "vendor",
    },
  })

  await returnService.markPickupInitiated(request.id)

  const latest = await returnService.listReturnRequests({ id: request.id })
  const synced = latest[0]
  if (synced?.order_id) {
    await syncOrderReturnMetadata(req.scope, synced.order_id, {
      id: synced.id,
      type: synced.type,
      status: synced.status,
      reason: synced.reason,
      created_at: synced.created_at,
    })
  }

  return {
    return_request: updated,
    shiprocket: created.raw || created,
    provider: provider.name,
  }
}

/** Resolve vendor from order workflow metadata (no order items required). */
export function resolveReturnVendorIdFromOrderMetadata(
  order: any,
  returnRequest?: any
): string | null {
  const meta = returnRequest ? getReturnMetadata(returnRequest) : {}
  const reverseVendorId = meta.reverse_vendor_id
    ? String(meta.reverse_vendor_id).trim()
    : ""
  if (reverseVendorId) return reverseVendorId

  const workflows = getVendorWorkflows(order?.metadata || null)
  for (const [vendorId, wf] of Object.entries(workflows)) {
    if (wf?.shipping_method === "easy") return vendorId
  }
  for (const vendorId of Object.keys(workflows)) {
    if (vendorId) return vendorId
  }
  return null
}

/** Resolve owning vendor id for a return (first matching product vendor). */
export async function resolveReturnVendorId(
  req: MedusaRequest,
  order: any,
  returnRequest?: any
): Promise<string | null> {
  const metaVendorId = resolveReturnVendorIdFromOrderMetadata(order, returnRequest)
  const productIds = Array.from(
    new Set(
      (order.items || [])
        .map((item: any) => item.product_id || item.variant?.product_id)
        .filter(Boolean)
    )
  ) as string[]
  if (!productIds.length) return metaVendorId

  const query = req.scope.resolve("query")

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id: productIds },
  })

  for (const product of products || []) {
    const vendorId = String((product as any)?.metadata?.vendor_id || "").trim()
    if (vendorId && isVendorEasyShipOrder(order, vendorId)) {
      return vendorId
    }
  }

  for (const product of products || []) {
    const vendorId = String((product as any)?.metadata?.vendor_id || "").trim()
    if (vendorId) return vendorId
  }
  return null
}
