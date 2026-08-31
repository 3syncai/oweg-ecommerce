import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { getEasyShipProvider } from "../../../../../services/easy-ship"
import { bookEasyShipmentForVendor } from "../../../../../lib/easy-ship-booking"
import {
  getPaymentType,
  getVendorProductIds,
  getVendorWorkflow,
  pickVendorItems,
  updateVendorOrderWorkflow,
} from "../../../../../lib/vendor-order-workflow"
import {
  buildVendorPickupAddress,
  estimatePackageFromVendorItems,
  retrieveVendorOrThrow,
} from "../../../../../lib/vendor-shiprocket-pickup"

async function loadOrderBundle(
  req: MedusaRequest,
  orderId: string,
  vendorId: string
) {
  const query = req.scope.resolve("query")
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "status",
      "currency_code",
      "created_at",
      "metadata",
      "summary.*",
      "items.*",
      "items.variant.*",
      "items.variant.product.*",
      "shipping_address.*",
      "billing_address.*",
      "fulfillments.*",
      "payment_collections.*",
    ],
    filters: { id: orderId },
  })
  const order = data?.[0]
  if (!order) return null

  const vendorProductIds = await getVendorProductIds(req, vendorId)
  const workflow = getVendorWorkflow(order.metadata, vendorId)
  return { order, vendorProductIds, workflow }
}

/**
 * GET /admin/packet-booking/:order_id/:vendor_id
 * Order + vendor Easy Ship detail + live courier rates for booking.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params?.order_id as string
  const vendorId = req.params?.vendor_id as string
  if (!orderId || !vendorId) {
    return res.status(400).json({ message: "order_id and vendor_id are required" })
  }

  try {
    const bundle = await loadOrderBundle(req, orderId, vendorId)
    if (!bundle) return res.status(404).json({ message: "Order not found" })

    const { order, vendorProductIds, workflow } = bundle
    if (workflow.shipping_method !== "easy") {
      return res.status(409).json({ message: "Vendor did not choose Easy Shipping" })
    }

    const vendor = await retrieveVendorOrThrow(req, vendorId)
    let pickup: ReturnType<typeof buildVendorPickupAddress> | null = null
    try {
      pickup = buildVendorPickupAddress(vendor)
    } catch (e: any) {
      return res.status(400).json({
        message: e?.message || "Vendor pickup address incomplete",
        workflow,
      })
    }

    const address = order.shipping_address || order.billing_address || {}
    const deliveryPostcode = String(address.postal_code || "").replace(/\D/g, "")
    const vendorItems = pickVendorItems(order, vendorProductIds)
    const suggested = await estimatePackageFromVendorItems(req, vendorItems)

    const q = ((req as any).query || {}) as Record<string, string>
    const parsePos = (raw: unknown, fallback: number) => {
      const n = typeof raw === "string" ? parseFloat(raw) : Number(raw)
      if (!Number.isFinite(n) || n <= 0) return fallback
      return n
    }

    const weight = parsePos(
      q.weight ?? workflow.easy_package_weight,
      suggested.weight
    )
    const length = parsePos(
      q.length ?? workflow.easy_package_length,
      suggested.length
    )
    const breadth = parsePos(
      q.breadth ?? workflow.easy_package_breadth,
      suggested.breadth
    )
    const height = parsePos(
      q.height ?? workflow.easy_package_height,
      suggested.height
    )

    const provider = getEasyShipProvider()
    const isCod = getPaymentType(order as any) === "PostPaid"
    const declaredValue = vendorItems.reduce((sum, item: any) => {
      const qty = Number(item?.quantity ?? 1) || 1
      return sum + Number(item?.unit_price || 0) * qty
    }, 0)

    let couriers: any[] = []
    let courierError: string | null = null
    try {
      const listed = await provider.listCouriers({
        pickup_postcode: pickup.pin_code,
        delivery_postcode: deliveryPostcode,
        weight,
        length,
        breadth,
        height,
        cod: isCod,
        declared_value: declaredValue > 0 ? declaredValue : undefined,
      })
      couriers = listed.couriers || []
    } catch (e: any) {
      courierError = e?.message || "Failed to load couriers"
    }

    return res.json({
      order_id: order.id,
      order_display_id: order.display_id,
      vendor_id: vendorId,
      vendor: {
        id: vendorId,
        name: workflow.vendor_name || vendor.name || null,
        store_name: workflow.store_name || vendor.store_name || null,
        email: workflow.vendor_email || vendor.email || null,
        phone: vendor.store_phone || vendor.phone || null,
      },
      workflow,
      pickup: {
        location: pickup.pickup_location,
        name: pickup.name,
        phone: pickup.phone,
        address: pickup.address,
        city: pickup.city,
        state: pickup.state,
        pin_code: pickup.pin_code,
      },
      delivery: {
        name: `${address.first_name || ""} ${address.last_name || ""}`.trim() || null,
        phone: address.phone || null,
        address: [address.address_1, address.address_2].filter(Boolean).join(", ") || null,
        city: address.city || null,
        province: address.province || null,
        postal_code: deliveryPostcode || null,
      },
      package: { weight, length, breadth, height },
      suggested_package: suggested,
      payment_type: getPaymentType(order as any),
      items: vendorItems.map((item: any) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        variant_title: item.variant_title || item.variant?.title || null,
      })),
      provider: provider.name,
      provider_label: provider.displayName,
      couriers,
      courier_error: courierError,
      already_booked: Boolean(workflow.shiprocket_awb || workflow.easy_booking_status === "booked"),
    })
  } catch (error: any) {
    console.error("[admin packet-booking] detail error:", error)
    return res.status(500).json({ message: error?.message || "Failed to load booking detail" })
  }
}

/**
 * POST /admin/packet-booking/:order_id/:vendor_id
 * Admin books Easy Ship courier after vendor RTD.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params?.order_id as string
  const vendorId = req.params?.vendor_id as string
  if (!orderId || !vendorId) {
    return res.status(400).json({ message: "order_id and vendor_id are required" })
  }

  try {
    const bundle = await loadOrderBundle(req, orderId, vendorId)
    if (!bundle) return res.status(404).json({ message: "Order not found" })

    const { order, vendorProductIds, workflow } = bundle
    if (workflow.shipping_method !== "easy") {
      return res.status(409).json({ message: "Vendor did not choose Easy Shipping" })
    }
    if (!workflow.rtd_at) {
      return res.status(409).json({
        message: "Vendor has not marked Ready to Dispatch yet",
      })
    }
    if (workflow.shiprocket_awb || workflow.easy_booking_status === "booked") {
      return res.status(409).json({
        message: "Courier already booked for this vendor order",
        awb: workflow.shiprocket_awb,
      })
    }

    const body = ((req as any).body || {}) as Record<string, unknown>
    const courierId = Number(body.courier_id ?? workflow.easy_courier_id)
    if (!Number.isFinite(courierId) || courierId <= 0) {
      return res.status(400).json({ message: "Select a courier (courier_id)" })
    }

    const booked = await bookEasyShipmentForVendor(
      req,
      order,
      vendorId,
      vendorProductIds,
      {
        courier_id: courierId,
        courier_partner_name:
          (body.courier_partner_name as string) || workflow.easy_courier_partner || null,
        rate: body.rate != null ? Number(body.rate) : workflow.easy_courier_rate,
        weight: body.weight != null ? Number(body.weight) : workflow.easy_package_weight,
        length: body.length != null ? Number(body.length) : workflow.easy_package_length,
        breadth: body.breadth != null ? Number(body.breadth) : workflow.easy_package_breadth,
        height: body.height != null ? Number(body.height) : workflow.easy_package_height,
      },
      workflow
    )

    const metadata = await updateVendorOrderWorkflow(req, order, vendorId, booked.patch)

    // Best-effort: refresh Medusa fulfillment labels with real AWB
    try {
      const fulfillmentId = String(workflow.medusa_fulfillment_id || "").trim()
      if (fulfillmentId && booked.awb) {
        const fulfillmentModule = req.scope.resolve(Modules.FULFILLMENT)
        await fulfillmentModule.updateFulfillment(fulfillmentId, {
          labels: [
            {
              tracking_number: booked.awb,
              tracking_url: String(booked.patch.tracking_url || ""),
              label_url: String(booked.patch.label_url || booked.patch.tracking_url || ""),
            },
          ],
        } as any)
      }
    } catch (labelErr: any) {
      console.warn(
        `[admin packet-booking] fulfillment label update skipped:`,
        labelErr?.message
      )
    }

    return res.json({
      ok: true,
      order_id: orderId,
      vendor_id: vendorId,
      awb: booked.awb,
      shipment_id: booked.shipment_id,
      provider: booked.provider_name,
      provider_label: booked.provider_label,
      assign_warning: booked.assign_warning,
      workflow: getVendorWorkflow(metadata, vendorId),
    })
  } catch (error: any) {
    console.error("[admin packet-booking] book error:", error)
    const status = /KYC|Select a courier|incomplete/i.test(String(error?.message || ""))
      ? 400
      : 500
    return res.status(status).json({
      message: error?.message || "Failed to book packet",
      detail: error?.detail || null,
    })
  }
}
