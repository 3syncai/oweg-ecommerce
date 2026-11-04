import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { getEasyShipProvider } from "../../../../../services/easy-ship"
import { bookEasyShipmentForVendor } from "../../../../../lib/easy-ship-booking"
import {
  getItemUnitPrice,
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
import { getSharedDbPool } from "../../../../../lib/db-pool"

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
      return sum + getItemUnitPrice(item) * qty
    }, 0)
    const volumetricKg =
      Math.round(((length * breadth * height) / 5000) * 10000) / 10000
    const chargeableKg = Math.max(weight, volumetricKg)

    let couriers: any[] = []
    let courierError: string | null = null
    let pincodeNotServiceable = false
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
      pincodeNotServiceable =
        e?.code === "PINCODE_NOT_SERVICEABLE" ||
        /not serviceable|non[- ]?serviceable|no .*courier/i.test(String(e?.message || ""))
    }

    const cancelled = workflow.easy_booking_status === "cancelled"
    const alreadyBooked = Boolean(
      !cancelled &&
        (workflow.shiprocket_awb || workflow.easy_booking_status === "booked")
    )

    let tracking: Record<string, unknown> | null = null
    const awb = String(workflow.shiprocket_awb || workflow.tracking_number || "").trim()
    if (awb && alreadyBooked) {
      try {
        tracking = await provider.trackByAwb(awb)
      } catch (trackErr: any) {
        tracking = {
          error: trackErr?.message || "Failed to fetch tracking",
          current_status: workflow.easy_tracking_status || null,
        }
      }
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
      package: {
        weight,
        length,
        breadth,
        height,
        volumetric_weight: volumetricKg,
        chargeable_weight: chargeableKg,
      },
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
      pincode_not_serviceable: pincodeNotServiceable,
      already_booked: alreadyBooked,
      can_rebook: cancelled || !alreadyBooked,
      tracking,
    })
  } catch (error: any) {
    console.error("[admin packet-booking] detail error:", error)
    return res.status(500).json({ message: error?.message || "Failed to load booking detail" })
  }
}

/**
 * POST /admin/packet-booking/:order_id/:vendor_id
 * Admin books an Easy Ship courier after the vendor has accepted and selected Easy Shipping.
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
    if (!workflow.accepted_at && (!workflow.stage || workflow.stage === "to_accept")) {
      return res.status(409).json({
        message: "Vendor has not accepted this order yet",
      })
    }
    const isCancelled = workflow.easy_booking_status === "cancelled"
    if (
      !isCancelled &&
      (workflow.shiprocket_awb || workflow.easy_booking_status === "booked")
    ) {
      return res.status(409).json({
        message: "Courier already booked for this vendor order. Cancel it first to rebook.",
        awb: workflow.shiprocket_awb,
      })
    }

    const body = ((req as any).body || {}) as Record<string, unknown>
    const courierId = Number(body.courier_id ?? workflow.easy_courier_id)
    if (!Number.isFinite(courierId) || courierId <= 0) {
      return res.status(400).json({ message: "Select a courier (courier_id)" })
    }

    // After cancel, clear stale AWB fields before creating a fresh shipment
    const bookingWorkflow = isCancelled
      ? {
          ...workflow,
          shiprocket_awb: null,
          shiprocket_order_id: null,
          shiprocket_shipment_id: null,
          tracking_number: null,
          admin_booked_at: null,
        }
      : workflow

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
      bookingWorkflow
    )

    const metadata = await updateVendorOrderWorkflow(req, order, vendorId, booked.patch)

    const courierRate = Number(booked.patch.easy_courier_rate || 0)
    if (process.env.DATABASE_URL && courierRate > 0) {
      try {
        const pool = getSharedDbPool()
        await pool.query(
          `UPDATE vendor_earnings_log
           SET logistic_fee = $3, updated_at = NOW()
           WHERE vendor_id = $1 AND order_id = $2`,
          [vendorId, orderId, courierRate]
        )
      } catch (poolErr) {
        console.warn("[admin packet-booking] logistic_fee sync skipped:", poolErr)
      }
    }

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
    const msg = String(error?.message || "")
    const notServiceable =
      error?.code === "PINCODE_NOT_SERVICEABLE" ||
      /not serviceable|non[- ]?serviceable/i.test(msg)
    const status = notServiceable
      ? 422
      : /KYC|Select a courier|incomplete|pickup_address/i.test(msg)
        ? 400
        : 500
    return res.status(status).json({
      message: error?.message || "Failed to book packet",
      detail: error?.detail || null,
      pincode_not_serviceable: notServiceable,
      can_retry: true,
    })
  }
}

/**
 * DELETE /admin/packet-booking/:order_id/:vendor_id
 * Cancel the Easy Ship (ITL/Shiprocket) booking so admin can rebook.
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params?.order_id as string
  const vendorId = req.params?.vendor_id as string
  if (!orderId || !vendorId) {
    return res.status(400).json({ message: "order_id and vendor_id are required" })
  }

  try {
    const bundle = await loadOrderBundle(req, orderId, vendorId)
    if (!bundle) return res.status(404).json({ message: "Order not found" })

    const { order, workflow } = bundle
    if (workflow.shipping_method !== "easy") {
      return res.status(409).json({ message: "Vendor did not choose Easy Shipping" })
    }

    const awb = String(
      workflow.shiprocket_awb || workflow.tracking_number || ""
    ).trim()
    if (!awb && workflow.easy_booking_status !== "booked") {
      return res.status(409).json({
        message: "No active Easy Ship booking to cancel",
      })
    }

    const provider = getEasyShipProvider()
    let providerCancel: Record<string, unknown> | null = null
    const isDummyAwb = /DUMMY|ITL-DUMMY|ITL-REV-DUMMY/i.test(awb)
    if (awb && !isDummyAwb) {
      try {
        // ITL cancel is AWB-based; Shiprocket adapter expects order ids —
        // pass AWB first, fall back to shiprocket_order_id for Shiprocket.
        const cancelIds =
          provider.name === "shiprocket" && workflow.shiprocket_order_id
            ? [String(workflow.shiprocket_order_id)]
            : [awb]
        providerCancel = await provider.cancelOrders(cancelIds)
      } catch (cancelErr: any) {
        const msg = String(cancelErr?.message || "")
        // Already cancelled / not found → still clear local booking so admin can rebook
        if (!/already|not found|invalid|cannot cancel/i.test(msg)) {
          return res.status(502).json({
            message: `Provider cancel failed: ${msg}`,
          })
        }
        providerCancel = { warning: msg }
      }
    } else if (isDummyAwb) {
      providerCancel = {
        skipped: true,
        reason: "Dummy AWB — cleared locally so you can rebook on live ITL",
      }
    }

    const now = new Date().toISOString()
    const metadata = await updateVendorOrderWorkflow(req, order, vendorId, {
      shiprocket_awb: null,
      shiprocket_order_id: null,
      shiprocket_shipment_id: null,
      shiprocket_status: "cancelled",
      tracking_number: null,
      tracking_url: null,
      label_url: null,
      easy_booking_status: "cancelled",
      easy_cancelled_at: now,
      easy_assign_warning: null,
      admin_booked_at: null,
    })

    return res.json({
      ok: true,
      cancelled: true,
      awb: awb || null,
      provider: provider.name,
      provider_cancel: providerCancel,
      workflow: getVendorWorkflow(metadata, vendorId),
      can_rebook: true,
    })
  } catch (error: any) {
    console.error("[admin packet-booking] cancel error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to cancel packet booking",
    })
  }
}
