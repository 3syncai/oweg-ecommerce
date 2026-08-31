import type { MedusaRequest } from "@medusajs/framework/http"
import { getEasyShipProvider } from "../services/easy-ship"
import {
  buildShiprocketForwardPayload,
  pickVendorItems,
  type VendorOrderWorkflow,
} from "./vendor-order-workflow"
import {
  ensureVendorEasyShipPickup,
  retrieveVendorOrThrow,
} from "./vendor-shiprocket-pickup"

export type EasyShipBookInput = {
  courier_id: number
  courier_partner_name?: string | null
  rate?: number | null
  weight?: number | null
  length?: number | null
  breadth?: number | null
  height?: number | null
}

export type EasyShipBookResult = {
  patch: Record<string, unknown>
  provider_name: string
  provider_label: string
  awb: string | null
  shipment_id: string | number | null
  order_id: string | number | null
  assign_warning: string | null
}

/**
 * Create forward Easy Ship shipment + AWB for a vendor slice of an order.
 * Used by admin Packet Booking (vendor Easy is intent-only).
 */
export async function bookEasyShipmentForVendor(
  req: MedusaRequest,
  order: any,
  vendorId: string,
  vendorProductIds: string[],
  input: EasyShipBookInput,
  existing?: VendorOrderWorkflow
): Promise<EasyShipBookResult> {
  const courierId = Number(input.courier_id)
  if (!Number.isFinite(courierId) || courierId <= 0) {
    throw new Error("Select a courier partner (courier_id)")
  }

  const courierName = String(
    input.courier_partner_name || existing?.easy_courier_partner || ""
  ).trim()
  const rateRaw =
    input.rate != null && Number.isFinite(Number(input.rate))
      ? Number(input.rate)
      : Number(existing?.easy_courier_rate)
  const courierRate =
    Number.isFinite(rateRaw) && rateRaw >= 0 ? Math.round(rateRaw * 100) / 100 : 0

  const weight =
    input.weight != null && Number.isFinite(Number(input.weight)) && Number(input.weight) > 0
      ? Number(input.weight)
      : Number(existing?.easy_package_weight) > 0
        ? Number(existing?.easy_package_weight)
        : null
  const length =
    input.length != null && Number.isFinite(Number(input.length)) && Number(input.length) > 0
      ? Number(input.length)
      : Number(existing?.easy_package_length) > 0
        ? Number(existing?.easy_package_length)
        : null
  const breadth =
    input.breadth != null && Number.isFinite(Number(input.breadth)) && Number(input.breadth) > 0
      ? Number(input.breadth)
      : Number(existing?.easy_package_breadth) > 0
        ? Number(existing?.easy_package_breadth)
        : null
  const height =
    input.height != null && Number.isFinite(Number(input.height)) && Number(input.height) > 0
      ? Number(input.height)
      : Number(existing?.easy_package_height) > 0
        ? Number(existing?.easy_package_height)
        : null

  const vendor = await retrieveVendorOrThrow(req, vendorId)
  const vendorPickup = await ensureVendorEasyShipPickup(req, vendor)
  const vendorItems = pickVendorItems(order, vendorProductIds)
  const provider = getEasyShipProvider()

  const created = await provider.createForwardShipment(
    buildShiprocketForwardPayload(order, vendorItems, vendorId, {
      courier_id: courierId,
      courier_name: courierName || null,
      pickup_location: vendorPickup.pickup_location,
      weight,
      length,
      breadth,
      height,
    }) as any
  )

  const shipmentId = created.shipment_id
  let awb = created.awb
  let assignWarning: string | null = null

  if (shipmentId && !awb) {
    try {
      const assigned = await provider.assignAwb(shipmentId, courierId)
      awb = assigned.awb || awb
    } catch (assignError: any) {
      const msg = String(assignError?.message || "")
      console.warn(`[${provider.displayName}] AWB assign after create failed:`, msg)
      if (/KYC/i.test(msg)) {
        const err = new Error(
          `${provider.displayName} blocked AWB assignment: complete KYC on your account, then try again.`
        ) as Error & { detail?: string; shiprocket_order_id?: unknown; shiprocket_shipment_id?: unknown }
        err.detail = msg
        err.shiprocket_order_id = created.order_id
        err.shiprocket_shipment_id = shipmentId
        throw err
      }
      assignWarning = msg
    }
  }

  const trackingUrl = awb ? provider.trackingUrlForAwb(String(awb)) : null
  const labelUrl = created.label_url || trackingUrl
  const now = new Date().toISOString()

  const patch: Record<string, unknown> = {
    shipping_method: "easy",
    shipping_provider: provider.name,
    shiprocket_order_id: created.order_id != null ? String(created.order_id) : null,
    shiprocket_shipment_id: shipmentId,
    shiprocket_awb: awb,
    shiprocket_status: awb ? "awb_assigned" : "created",
    easy_courier_id: courierId,
    easy_courier_partner: courierName.slice(0, 120) || null,
    easy_courier_rate: courierRate,
    tracking_number: awb ? String(awb) : null,
    tracking_url: trackingUrl,
    label_url: labelUrl,
    easy_pickup_location: vendorPickup.pickup_location,
    easy_pickup_pincode: vendorPickup.pin_code,
    easy_package_weight: weight,
    easy_package_length: length,
    easy_package_breadth: breadth,
    easy_package_height: height,
    easy_assign_warning: assignWarning,
    easy_booking_status: "booked",
    admin_booked_at: now,
  }

  return {
    patch,
    provider_name: provider.name,
    provider_label: provider.displayName,
    awb: awb ? String(awb) : null,
    shipment_id: shipmentId,
    order_id: created.order_id,
    assign_warning: assignWarning,
  }
}
