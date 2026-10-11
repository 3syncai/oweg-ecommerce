import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireVendorAuth } from "../../_lib/guards"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { getEasyShipProvider } from "../../../../services/easy-ship"
import { ItlProvider } from "../../../../services/easy-ship/itl"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.VENDOR_CORS || "http://localhost:4000"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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

function parseNumber(val: unknown, fallback: number): number {
  if (typeof val === "number" && Number.isFinite(val) && val > 0) return val
  if (typeof val === "string") {
    const n = parseFloat(val)
    if (Number.isFinite(n) && n > 0) return n
  }
  return fallback
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  return handleEstimate(req, res)
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return handleEstimate(req, res)
}

async function handleEstimate(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)

  const query = ((req as any).query || {}) as Record<string, string>
  const body = ((req as any).body || {}) as Record<string, any>

  const rawHeight = query.height ?? body.height
  const rawWidth = query.width ?? query.breadth ?? body.width ?? body.breadth
  const rawLength = query.length ?? body.length
  const rawWeight = query.weight ?? body.weight

  const height = parseNumber(rawHeight, 10)
  const width = parseNumber(rawWidth, 10)
  const length = parseNumber(rawLength, 10)
  let weight = parseNumber(rawWeight, 0.5)

  // If vendor enters weight in grams (e.g. 500, 1000), convert to kg
  if (weight > 20) {
    weight = Number((weight / 1000).toFixed(2))
  }

  // Calculate volumetric weight: (L * W * H) / 5000
  const volumetricWeight = Number(((length * width * height) / 5000).toFixed(2))
  const appliedWeight = Math.max(weight, volumetricWeight)

  // Resolve vendor pickup pincode
  let pickupPincode =
    String(query.from_pincode || query.pickup_pincode || body.from_pincode || body.pickup_pincode || "").replace(/\D/g, "")

  if (!pickupPincode || pickupPincode.length !== 6) {
    try {
      const vendorId = await requireVendorAuth(req)
      if (vendorId) {
        const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
        const vendor = await vendorService.retrieveVendor(vendorId)
        const pin = String(vendor?.store_pincode || "").replace(/\D/g, "")
        if (pin && pin.length === 6) {
          pickupPincode = pin
        }
      }
    } catch {
      // ignore
    }
  }

  if (!pickupPincode || pickupPincode.length !== 6) {
    pickupPincode = "400092" // Default origin benchmark pin
  }

  let deliveryPincode =
    String(query.to_pincode || query.delivery_pincode || body.to_pincode || body.delivery_pincode || "").replace(/\D/g, "")
  if (!deliveryPincode || deliveryPincode.length !== 6) {
    deliveryPincode = "110001" // Default destination benchmark pin
  }

  try {
    // Attempt ITL rate check via ItlProvider or configured EasyShipProvider
    let couriers: any[] = []
    let providerName = "itl"

    try {
      const itl = new ItlProvider()
      const result = await itl.listCouriers({
        pickup_postcode: pickupPincode,
        delivery_postcode: deliveryPincode,
        length,
        breadth: width,
        height,
        weight: appliedWeight,
      })
      couriers = result.couriers || []
    } catch (itlErr: any) {
      console.warn(`[Shipping Estimate] Live ITL call error: ${itlErr?.message}. Trying fallback provider...`)
      const fallbackProvider = getEasyShipProvider()
      providerName = fallbackProvider.name
      const fallbackResult = await fallbackProvider.listCouriers({
        pickup_postcode: pickupPincode,
        delivery_postcode: deliveryPincode,
        length,
        breadth: width,
        height,
        weight: appliedWeight,
      })
      couriers = fallbackResult.couriers || []
    }

    if (couriers.length > 0) {
      // Pick highest price as requested: sort descending by freight charge
      const validCouriers = couriers.filter(
        (c) => typeof c.freight_charge === "number" && c.freight_charge > 0
      )
      const sorted = (validCouriers.length > 0 ? validCouriers : couriers).sort(
        (a, b) => Number(b.freight_charge || b.rate || 0) - Number(a.freight_charge || a.rate || 0)
      )

      const selected = sorted[0]
      const freightCharge = round2(Number(selected.freight_charge || selected.rate || 70))
      const gstRate = 18
      const gstAmount = round2((freightCharge * gstRate) / 100)
      const totalLogisticsFee = round2(freightCharge + gstAmount)

      return res.json({
        success: true,
        provider: "standard",
        courier_name: "Standard Delivery",
        freight_charge: freightCharge,
        gst_rate: gstRate,
        gst_amount: gstAmount,
        total_logistics_fee: totalLogisticsFee,
        pickup_pincode: pickupPincode,
        delivery_pincode: deliveryPincode,
        weight,
        volumetric_weight: volumetricWeight,
        applied_weight: appliedWeight,
      })
    }
  } catch (err: any) {
    console.warn(`[Shipping Estimate] All courier calls failed: ${err?.message}. Using standard weight-based calculation.`)
  }

  // Graceful fallback rate if all external courier APIs are offline
  // Standard tiered rate: 0.5kg -> 79, 1kg -> 95, +35 per additional kg
  const baseRate = appliedWeight <= 0.5 ? 79 : appliedWeight <= 1 ? 95 : 95 + Math.ceil(appliedWeight - 1) * 35
  const freightCharge = round2(baseRate)
  const gstRate = 18
  const gstAmount = round2((freightCharge * gstRate) / 100)
  const totalLogisticsFee = round2(freightCharge + gstAmount)

  return res.json({
    success: true,
    provider: "standard",
    courier_name: "Standard Delivery",
    freight_charge: freightCharge,
    gst_rate: gstRate,
    gst_amount: gstAmount,
    total_logistics_fee: totalLogisticsFee,
    pickup_pincode: pickupPincode,
    delivery_pincode: deliveryPincode,
    weight,
    volumetric_weight: volumetricWeight,
    applied_weight: appliedWeight,
    fallback: true,
  })
}
