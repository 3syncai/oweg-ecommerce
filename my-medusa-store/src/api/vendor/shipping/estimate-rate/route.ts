import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireVendorAuth } from "../../_lib/guards"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { ItlProvider } from "../../../../services/easy-ship/itl"
import { packedPackage, validPincode, compareShippingRoutes, BENCHMARK_DESTINATIONS, ESTIMATE_TTL_MS } from "../../../../lib/shipping-estimate"

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

const cache = new Map<string, { expires: number; value: Awaited<ReturnType<typeof compareShippingRoutes>>; quotedAt: string }>()

export async function GET(req: MedusaRequest, res: MedusaResponse) { return handleEstimate(req, res) }
export async function POST(req: MedusaRequest, res: MedusaResponse) { return handleEstimate(req, res) }

async function handleEstimate(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  res.setHeader("Cache-Control", "no-store")
  const vendorId = await requireVendorAuth(req)
  if (!vendorId) return res.status(401).json({ message: "Sign in as a vendor to estimate shipping" })
  const query = req.query as Record<string, unknown>
  const body = (req.body || {}) as Record<string, unknown>
  const value = (key: string) => query[key] ?? body[key]
  let parcel: ReturnType<typeof packedPackage>
  try {
    parcel = packedPackage({ length: value("length"), width: value("width") ?? value("breadth"), height: value("height"), weight: value("weight") })
  } catch (error) { return res.status(400).json({ message: (error as Error).message }) }
  const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  const vendor = await vendorService.retrieveVendor(vendorId)
  const pickup = String(vendor.store_pincode || "").trim()
  if (!validPincode(pickup)) return res.status(422).json({ message: "Complete your store pickup pincode in Profile & store before calculating shipping" })
  const destination = String(value("delivery_pincode") ?? value("to_pincode") ?? "").trim()
  if (destination && !validPincode(destination)) return res.status(400).json({ message: "Delivery pincode must be six digits" })
  const declaredValue = Number(value("declared_value") ?? 1000)
  if (!Number.isFinite(declaredValue) || declaredValue <= 0) return res.status(400).json({ message: "Product base MRP must be positive" })
  const destinations = destination ? [{ pincode: destination, label: "Selected destination" }] : [
    { pincode: pickup, label: "Local pickup area" }, ...BENCHMARK_DESTINATIONS.filter(d => d.pincode !== pickup),
  ]
  const key = JSON.stringify([vendorId, pickup, destination, parcel, declaredValue])
  try {
    let saved = cache.get(key)
    if (!saved || saved.expires <= Date.now() || value("refresh") === "true" || value("refresh") === true) {
      const provider = new ItlProvider()
      const result = await compareShippingRoutes(pickup, destinations, async pin => {
        const response = await provider.listCouriers({ pickup_postcode: pickup, delivery_postcode: pin,
          length: parcel.length, breadth: parcel.width, height: parcel.height, weight: parcel.weight,
          declared_value: declaredValue, cod: false })
        return response.couriers
      })
      const quotedAt = new Date().toISOString()
      saved = { value: result, quotedAt, expires: Date.now() + ESTIMATE_TTL_MS }
      if (cache.size >= 128) cache.delete(cache.keys().next().value!)
      cache.set(key, saved)
    }
    return res.json({ success: true, provider: "itl", ...saved.value, ...parcel,
      gst_rate: 18, coverage: destination ? "destination" : "national_benchmark",
      quoted_at: saved.quotedAt, expires_at: new Date(saved.expires).toISOString(),
      package_units: { dimensions: "cm", weight: "kg" }, volumetric_divisor: 5000,
      selection_policy: "highest_of_economical_prepaid_surface_routes",
      warning: "Highest economical quote across the displayed representative destinations; not a guaranteed maximum for every Indian pincode. Unavailable routes are excluded. COD, return/RTO and later weight adjustments are excluded. No extra buffer added.",
    })
  } catch (error) {
    console.warn("[Shipping Estimate]", (error as Error).message)
    return res.status(503).json({ success: false, message: (error as Error).message || "Live ITL quote unavailable; retry or request a manual quote" })
  }
}
