import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import ShiprocketService from "../../../../../services/shiprocket"
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

function normalizeCouriers(raw: Record<string, unknown>) {
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
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const ar = a.rate == null ? Number.POSITIVE_INFINITY : a.rate
      const br = b.rate == null ? Number.POSITIVE_INFINITY : b.rate
      return ar - br
    })
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

    const shiprocket = new ShiprocketService()
    const isCod = getPaymentType(result.order) === "PostPaid"

    const response = await shiprocket.getServiceability({
      pickup_postcode: pickupPostcode,
      delivery_postcode: deliveryPostcode,
      weight,
      length,
      breadth,
      height,
      cod: isCod,
    })

    const couriers = normalizeCouriers(response)
    const volumetric = Number(((length * breadth * height) / 5000).toFixed(3))

    return res.json({
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
      cod: isCod,
      couriers,
      count: couriers.length,
    })
  } catch (error: any) {
    console.error("Vendor order couriers error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to load courier partners",
    })
  }
}
