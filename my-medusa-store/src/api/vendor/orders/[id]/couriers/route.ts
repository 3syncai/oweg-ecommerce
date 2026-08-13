import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import { getEasyShipProvider } from "../../../../../services/easy-ship"
import {
  getPaymentType,
  getVendorOrderOrRespond,
  pickVendorItems,
  setVendorOrderCorsHeaders,
} from "../../../../../lib/vendor-order-workflow"
import {
  buildVendorPickupAddress,
  estimatePackageFromVendorItems,
  retrieveVendorOrThrow,
} from "../../../../../lib/vendor-shiprocket-pickup"

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

function parsePositiveNumber(raw: unknown, fallback: number): number {
  const n = typeof raw === "string" ? parseFloat(raw) : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const orderId = req.params?.id as string
  if (!orderId) return res.status(400).json({ message: "Order id is required" })

  try {
    const result = await getVendorOrderOrRespond(req, res, auth.vendor_id, orderId)
    if (!result) return

    const vendor = await retrieveVendorOrThrow(req, auth.vendor_id)
    let pickup
    try {
      pickup = buildVendorPickupAddress(vendor)
    } catch (e: any) {
      return res.status(400).json({ message: e?.message || "Vendor pickup address incomplete" })
    }

    const address = result.order.shipping_address || result.order.billing_address || {}
    const deliveryPostcode = String(address.postal_code || "").replace(/\D/g, "")
    const pickupPostcode = pickup.pin_code

    if (!deliveryPostcode || deliveryPostcode.length !== 6) {
      return res.status(400).json({
        message: "Order delivery pincode is missing or invalid",
      })
    }

    const query = ((req as any).query || {}) as Record<string, string>
    const vendorItems = pickVendorItems(result.order, result.vendorProductIds)
    const suggested = await estimatePackageFromVendorItems(req, vendorItems)

    const hasOverride =
      query.weight != null ||
      query.length != null ||
      query.breadth != null ||
      query.height != null

    const weight = parsePositiveNumber(query.weight, suggested.weight)
    const length = parsePositiveNumber(query.length, suggested.length)
    const breadth = parsePositiveNumber(query.breadth, suggested.breadth)
    const height = parsePositiveNumber(query.height, suggested.height)
    const packageSource = hasOverride ? "manual" : suggested.source

    const provider = getEasyShipProvider()
    const isCod = getPaymentType(result.order) === "PostPaid"
    const declaredValue = vendorItems.reduce((sum, item: any) => {
      const qty = Number(item?.quantity ?? item?.detail?.quantity ?? 1) || 1
      return sum + Number(item?.unit_price || 0) * qty
    }, 0)

    const { couriers, rawAvailableCount } = await provider.listCouriers({
      pickup_postcode: pickupPostcode,
      delivery_postcode: deliveryPostcode,
      weight,
      length,
      breadth,
      height,
      cod: isCod,
      declared_value: declaredValue > 0 ? declaredValue : undefined,
    })

    const volumetric = Number(((length * breadth * height) / 5000).toFixed(3))

    console.log(
      `[Vendor order couriers] provider=${provider.name} order=${orderId} pickup=${pickupPostcode} delivery=${deliveryPostcode} ` +
        `weight=${weight} declared=${declaredValue} raw_available=${rawAvailableCount ?? "n/a"} normalized=${couriers.length}`
    )

    return res.json({
      provider: provider.name,
      provider_label: provider.displayName,
      pickup_postcode: pickupPostcode,
      pickup_city: pickup.city,
      pickup_address: pickup.address,
      delivery_postcode: deliveryPostcode,
      weight,
      length,
      breadth,
      height,
      volumetric_weight: volumetric,
      applied_weight: Math.max(weight, volumetric),
      package_source: packageSource,
      suggested_package: suggested,
      declared_value: declaredValue,
      cod: isCod,
      couriers,
      count: couriers.length,
      shiprocket_available_count: rawAvailableCount,
    })
  } catch (error: any) {
    console.error("Vendor order couriers error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to load courier partners",
    })
  }
}
