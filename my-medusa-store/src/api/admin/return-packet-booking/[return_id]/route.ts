import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { Pool } from "pg"
import { getEasyShipProvider } from "../../../../services/easy-ship"
import { loadReturnPacketBookingDetail } from "../../../../lib/return-packet-booking-queue"
import {
  buildVendorPickupAddress,
  estimatePackageFromVendorItems,
  retrieveVendorOrThrow,
} from "../../../../lib/vendor-shiprocket-pickup"
import {
  getReturnMetadata,
  initiateEasyShipReversePickup,
} from "../../../../lib/vendor-return-shiprocket"
import {
  getVendorWorkflow,
  mergeVendorWorkflowMetadata,
} from "../../../../lib/vendor-order-workflow"
import { applyVendorReturnCourierFee } from "../../../../lib/vendor-earnings"

/**
 * GET /admin/return-packet-booking/:return_id
 * Return detail + reverse courier rates for admin booking.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const returnId = req.params?.return_id as string
  if (!returnId) {
    return res.status(400).json({ message: "return_id is required" })
  }

  try {
    const bundle = await loadReturnPacketBookingDetail(req, returnId)
    if (!bundle) {
      return res.status(404).json({ message: "Return request not found" })
    }
    if ("error" in bundle && bundle.error === "not_easy_ship") {
      return res.status(409).json({
        message: "Return is not for an Easy Ship order",
      })
    }

    const { request, order, vendorId, returnItems, workflow } = bundle as Exclude<
      typeof bundle,
      { error: string }
    >

    const vendor = await retrieveVendorOrThrow(req, vendorId)
    let delivery
    try {
      delivery = buildVendorPickupAddress(vendor)
    } catch (e: any) {
      return res.status(400).json({
        message: e?.message || "Vendor store address incomplete",
      })
    }

    const customerAddress = order.shipping_address || {}
    const pickupPostcode = String(customerAddress.postal_code || "").replace(/\D/g, "")

    const query = req.scope.resolve("query")
    const { data: orderItemsData } = await query.graph({
      entity: "order",
      fields: ["items.*", "items.variant.*"],
      filters: { id: order.id },
    })
    const fullOrder = orderItemsData?.[0]
    const orderItems = fullOrder?.items || []

    const vendorItems = orderItems.filter((item: any) => {
      const returnItemIds = new Set(returnItems.map((ri: any) => ri.order_item_id))
      return returnItemIds.has(item.id)
    })
    const suggested = await estimatePackageFromVendorItems(req, vendorItems.length ? vendorItems : orderItems)

    const q = ((req as any).query || {}) as Record<string, string>
    const parsePos = (raw: unknown, fallback: number) => {
      const n = typeof raw === "string" ? parseFloat(raw) : Number(raw)
      if (!Number.isFinite(n) || n <= 0) return fallback
      return n
    }

    const weight = parsePos(q.weight, suggested.weight)
    const length = parsePos(q.length, suggested.length)
    const breadth = parsePos(q.breadth, suggested.breadth)
    const height = parsePos(q.height, suggested.height)

    const provider = getEasyShipProvider()
    const meta = getReturnMetadata(request)

    let couriers: any[] = []
    let courierError: string | null = null
    try {
      const listed = await provider.listCouriers({
        pickup_postcode: pickupPostcode,
        delivery_postcode: delivery.pin_code,
        weight,
        length,
        breadth,
        height,
        cod: false,
        is_return: true,
      })
      couriers = listed.couriers || []
    } catch (e: any) {
      courierError = e?.message || "Failed to load reverse couriers"
    }

    const booked = Boolean(
      request.shiprocket_order_id ||
        request.shiprocket_awb ||
        request.pickup_initiated_at ||
        meta.return_admin_booking_status === "booked"
    )

    return res.json({
      return_id: request.id,
      order_id: order.id,
      order_display_id: order.display_id,
      return_status: request.status,
      reason: request.reason,
      approved_at: request.approved_at,
      vendor_id: vendorId,
      vendor: {
        id: vendorId,
        name: workflow.vendor_name || vendor.name || null,
        store_name: workflow.store_name || vendor.store_name || null,
        email: workflow.vendor_email || vendor.email || null,
        phone: vendor.store_phone || vendor.phone || null,
      },
      pickup: {
        name: `${customerAddress.first_name || ""} ${customerAddress.last_name || ""}`.trim() || null,
        phone: customerAddress.phone || null,
        address: [customerAddress.address_1, customerAddress.address_2]
          .filter(Boolean)
          .join(", ") || null,
        city: customerAddress.city || null,
        state: customerAddress.province || null,
        pin_code: pickupPostcode || null,
      },
      delivery: {
        location: delivery.pickup_location,
        name: delivery.name,
        phone: delivery.phone,
        address: delivery.address,
        city: delivery.city,
        state: delivery.state,
        pin_code: delivery.pin_code,
      },
      package: { weight, length, breadth, height },
      suggested_package: suggested,
      items: returnItems.map((ri: any) => {
        const original = orderItems.find((oi: any) => oi.id === ri.order_item_id)
        return {
          id: ri.id,
          order_item_id: ri.order_item_id,
          title: original?.title || "Return item",
          quantity: ri.quantity,
          unit_price: original?.unit_price,
        }
      }),
      provider: provider.name,
      provider_label: provider.displayName,
      couriers,
      courier_error: courierError,
      already_booked: booked,
      shiprocket_awb: request.shiprocket_awb,
      reverse_courier_name: meta.reverse_courier_name || null,
    })
  } catch (error: any) {
    console.error("[admin return-packet-booking] detail error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to load return booking detail",
    })
  }
}

/**
 * POST /admin/return-packet-booking/:return_id
 * Admin books reverse pickup (customer → vendor).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const returnId = req.params?.return_id as string
  if (!returnId) {
    return res.status(400).json({ message: "return_id is required" })
  }

  try {
    const bundle = await loadReturnPacketBookingDetail(req, returnId)
    if (!bundle) {
      return res.status(404).json({ message: "Return request not found" })
    }
    if ("error" in bundle && bundle.error === "not_easy_ship") {
      return res.status(409).json({
        message: "Return is not for an Easy Ship order",
      })
    }

    const { request, order, vendorId } = bundle as Exclude<
      typeof bundle,
      { error: string }
    >

    if (String(request.status) !== "approved") {
      return res.status(409).json({
        message: "Return must be approved before booking reverse pickup",
        status: request.status,
      })
    }

    const meta = getReturnMetadata(request)
    if (
      request.shiprocket_order_id ||
      request.shiprocket_awb ||
      request.pickup_initiated_at ||
      meta.return_admin_booking_status === "booked"
    ) {
      return res.status(409).json({
        message: "Return pickup already booked",
        awb: request.shiprocket_awb,
      })
    }

    const body = ((req as any).body || {}) as Record<string, unknown>
    const courierId = Number(body.courier_id)
    const courierName = String(body.courier_name || "").trim()
    const rateRaw = body.rate != null ? Number(body.rate) : Number(body.freight_charge)
    const courierRate =
      Number.isFinite(rateRaw) && rateRaw >= 0 ? Math.round(rateRaw * 100) / 100 : 0

    if (!Number.isFinite(courierId) || courierId <= 0) {
      return res.status(400).json({ message: "Select a courier (courier_id)" })
    }
    if (!courierName) {
      return res.status(400).json({ message: "courier_name is required" })
    }

    const result = await initiateEasyShipReversePickup({
      req,
      returnRequestId: request.id,
      vendorId,
      courierOverride: {
        courier_id: courierId,
        courier_name: courierName,
        courier_rate: courierRate,
      },
      bookedBy: "admin",
    })

    // Sync return fee onto order workflow + vendor earnings
    try {
      const orderModuleService = req.scope.resolve(Modules.ORDER)
      const orderEntity = await orderModuleService.retrieveOrder(request.order_id)
      const existingWf = getVendorWorkflow(
        (orderEntity.metadata || {}) as Record<string, unknown>,
        vendorId
      )
      const metadata = mergeVendorWorkflowMetadata(
        (orderEntity.metadata || {}) as Record<string, unknown>,
        vendorId,
        {
          ...existingWf,
          return_courier_id: courierId,
          return_courier_name: courierName,
          return_courier_rate: courierRate,
        }
      )
      await orderModuleService.updateOrders(request.order_id, { metadata })

      if (process.env.DATABASE_URL && courierRate > 0) {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL })
        try {
          await applyVendorReturnCourierFee(
            vendorId,
            request.order_id,
            courierRate,
            pool
          )
        } finally {
          await pool.end().catch(() => undefined)
        }
      }
    } catch (feeErr) {
      console.error("[admin return-packet-booking] fee sync failed:", feeErr)
    }

    return res.json({
      ok: true,
      return_id: returnId,
      order_id: order.id,
      vendor_id: vendorId,
      awb: result.return_request?.shiprocket_awb || null,
      provider: result.provider,
      return_request: result.return_request,
    })
  } catch (error: any) {
    console.error("[admin return-packet-booking] book error:", error)
    const status = /Select a|approval|Easy Ship|incomplete|pincode/i.test(
      String(error?.message || "")
    )
      ? 400
      : 500
    return res.status(status).json({
      message: error?.message || "Failed to book return pickup",
    })
  }
}
