import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import ShiprocketService from "../../../../../services/shiprocket"
import {
  buildVendorPickupAddress,
  estimatePackageFromVendorItems,
  retrieveVendorOrThrow,
} from "../../../../../lib/vendor-shiprocket-pickup"
import {
  isVendorEasyShipOrder,
  normalizeCouriers,
  resolveVendorOwnedReturn,
} from "../../../../../lib/vendor-return-shiprocket"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.VENDOR_CORS || "http://localhost:4000"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

/**
 * GET /vendor/returns/:id/couriers
 * Reverse serviceability: pickup at customer pincode → deliver to vendor store.
 * Only for Easy Ship orders.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const returnId = req.params?.id as string
  if (!returnId) return res.status(400).json({ message: "Return id is required" })

  try {
    const resolved = await resolveVendorOwnedReturn(req, auth.vendor_id, returnId)
    if ("error" in resolved && resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message })
    }

    const { request, order, vendorProductIds } = resolved
    if (!isVendorEasyShipOrder(order, auth.vendor_id)) {
      return res.status(400).json({
        message: "Shiprocket reverse services are only available for Easy Ship orders",
      })
    }

    if (["rejected", "closed", "refunded", "replaced"].includes(String(request.status))) {
      return res.status(400).json({ message: "Return is already closed" })
    }

    const vendor = await retrieveVendorOrThrow(req, auth.vendor_id)
    let delivery
    try {
      delivery = buildVendorPickupAddress(vendor)
    } catch (e: any) {
      return res.status(400).json({
        message: e?.message || "Complete your store address before selecting a return courier",
      })
    }

    const customerAddress = order.shipping_address || order.billing_address || {}
    const pickupPostcode = String(customerAddress.postal_code || "").replace(/\D/g, "")
    if (!pickupPostcode || pickupPostcode.length !== 6) {
      return res.status(400).json({
        message: "Customer pickup pincode is missing or invalid",
      })
    }

    const vendorItems = (order.items || []).filter((item: any) => {
      const productId = item.product_id || item.variant?.product_id
      return productId && vendorProductIds.has(productId)
    })
    const pkg = await estimatePackageFromVendorItems(req, vendorItems)

    const shiprocket = new ShiprocketService()
    const response = await shiprocket.getServiceability({
      pickup_postcode: pickupPostcode,
      delivery_postcode: delivery.pin_code,
      weight: pkg.weight,
      length: pkg.length,
      breadth: pkg.breadth,
      height: pkg.height,
      cod: false,
      is_return: true,
    })

    const couriers = normalizeCouriers(response)

    return res.json({
      return_request_id: request.id,
      status: request.status,
      pickup_postcode: pickupPostcode,
      delivery_postcode: delivery.pin_code,
      delivery_city: delivery.city,
      delivery_address: delivery.address,
      weight: pkg.weight,
      length: pkg.length,
      breadth: pkg.breadth,
      height: pkg.height,
      couriers,
      count: couriers.length,
    })
  } catch (error: any) {
    console.error("[Vendor return couriers] error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to load reverse courier partners",
    })
  }
}
