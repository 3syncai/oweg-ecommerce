import type { MedusaRequest } from "@medusajs/framework/http"
import VendorModuleService from "../modules/vendor/service"
import { VENDOR_MODULE } from "../modules/vendor"
import ShiprocketService from "../services/shiprocket"
import { getItemUnits } from "./vendor-order-workflow"

export type VendorPickupAddress = {
  pickup_location: string
  name: string
  email: string
  phone: string
  address: string
  address_2: string
  city: string
  state: string
  country: string
  pin_code: string
  vendor_name: string
  gstin?: string
  fingerprint: string
}

export type PackageEstimate = {
  weight: number
  length: number
  breadth: number
  height: number
  source: "product" | "default"
  product_count: number
  notes?: string
}

function digitsPhone(raw: unknown): string {
  const digits = String(raw || "").replace(/\D/g, "")
  if (digits.length >= 10) return digits.slice(-10)
  return digits
}

function sanitizePickupNickname(vendorId: string, fingerprint: string): string {
  const idPart = String(vendorId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-10)
  const hashPart = fingerprint.slice(0, 6)
  // Shiprocket max nickname length is 36
  return `v-${idPart}-${hashPart}`.slice(0, 36)
}

function countryLabel(codeOrName: unknown): string {
  const raw = String(codeOrName || "IN").trim()
  if (!raw) return "India"
  if (/^in$/i.test(raw) || /india/i.test(raw)) return "India"
  return raw
}

/** Build pickup fields from vendor store_* profile. */
export function buildVendorPickupAddress(vendor: any): VendorPickupAddress {
  const pin = String(vendor?.store_pincode || "").replace(/\D/g, "")
  const address = String(vendor?.store_address || "").trim()
  const city = String(vendor?.store_city || "").trim()
  const state = String(vendor?.store_region || "").trim()
  const phone = digitsPhone(vendor?.store_phone || vendor?.phone || vendor?.whatsapp_number)
  const name = String(
    vendor?.store_name ||
      vendor?.name ||
      `${vendor?.first_name || ""} ${vendor?.last_name || ""}`.trim() ||
      "Vendor"
  ).trim()
  const email = String(vendor?.email || "").trim()
  const country = countryLabel(vendor?.store_country)

  if (!pin || pin.length !== 6) {
    throw new Error("Complete your store pincode in Vendor Profile before Easy Shipping")
  }
  if (!address) {
    throw new Error("Complete your store address in Vendor Profile before Easy Shipping")
  }
  if (!city) {
    throw new Error("Complete your store city in Vendor Profile before Easy Shipping")
  }
  if (!state) {
    throw new Error("Complete your store state/region in Vendor Profile before Easy Shipping")
  }
  if (!phone || phone.length !== 10) {
    throw new Error("Complete a valid 10-digit store/phone number in Vendor Profile before Easy Shipping")
  }
  if (!email) {
    throw new Error("Vendor email is required for Shiprocket pickup")
  }

  const fingerprint = [
    pin,
    address.toLowerCase(),
    city.toLowerCase(),
    state.toLowerCase(),
    phone,
  ].join("|")

  return {
    pickup_location: sanitizePickupNickname(String(vendor.id), fingerprint),
    name: name.slice(0, 80),
    email,
    phone,
    address: address.slice(0, 80),
    address_2: "",
    city: city.slice(0, 50),
    state: state.slice(0, 50),
    country,
    pin_code: pin,
    vendor_name: name.slice(0, 80),
    gstin: vendor?.gst_no ? String(vendor.gst_no) : undefined,
    fingerprint,
  }
}

export async function retrieveVendorOrThrow(req: MedusaRequest, vendorId: string) {
  const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  return await vendorService.retrieveVendor(vendorId)
}

/**
 * Ensure this vendor's store address exists as a Shiprocket pickup location.
 * Caches nickname + fingerprint on vendor.metadata.
 */
export async function ensureVendorShiprocketPickup(
  req: MedusaRequest,
  vendor: any
): Promise<{ pickup_location: string; pin_code: string; address: VendorPickupAddress }> {
  const pickup = buildVendorPickupAddress(vendor)
  const metadata = (vendor.metadata && typeof vendor.metadata === "object"
    ? { ...vendor.metadata }
    : {}) as Record<string, any>

  const cachedName = String(metadata.shiprocket_pickup_location || "").trim()
  const cachedFp = String(metadata.shiprocket_pickup_fingerprint || "").trim()

  const shiprocket = new ShiprocketService()

  // Reuse cached nickname when address fingerprint is unchanged and location still exists
  if (cachedName && cachedFp === pickup.fingerprint) {
    try {
      const listed = await shiprocket.listPickupLocations()
      const names = extractPickupNames(listed)
      if (names.has(cachedName.toLowerCase())) {
        return { pickup_location: cachedName, pin_code: pickup.pin_code, address: pickup }
      }
    } catch (e: any) {
      console.warn("[Shiprocket] list pickup locations failed:", e?.message)
    }
  }

  // Create (or recreate) pickup for current vendor address
  try {
    await shiprocket.addPickupLocation({
      pickup_location: pickup.pickup_location,
      name: pickup.name,
      email: pickup.email,
      phone: pickup.phone,
      address: pickup.address,
      address_2: pickup.address_2,
      city: pickup.city,
      state: pickup.state,
      country: pickup.country,
      pin_code: pickup.pin_code,
      address_type: "vendor",
      vendor_name: pickup.vendor_name,
      ...(pickup.gstin ? { gstin: pickup.gstin } : {}),
    })
  } catch (e: any) {
    const msg = String(e?.message || "")
    // If nickname already exists, reuse it
    if (!/already|exist|duplicate/i.test(msg)) {
      // Try listing — maybe it was created previously under this nickname
      try {
        const listed = await shiprocket.listPickupLocations()
        const names = extractPickupNames(listed)
        if (names.has(pickup.pickup_location.toLowerCase())) {
          // ok
        } else {
          throw e
        }
      } catch {
        throw new Error(
          msg.includes("Shiprocket")
            ? msg
            : `Failed to register vendor pickup on Shiprocket: ${msg}`
        )
      }
    }
  }

  const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  await vendorService.updateVendors({
    id: vendor.id,
    metadata: {
      ...metadata,
      shiprocket_pickup_location: pickup.pickup_location,
      shiprocket_pickup_fingerprint: pickup.fingerprint,
      shiprocket_pickup_pincode: pickup.pin_code,
    },
  })

  return {
    pickup_location: pickup.pickup_location,
    pin_code: pickup.pin_code,
    address: pickup,
  }
}

function extractPickupNames(listed: Record<string, unknown>): Set<string> {
  const data = (listed as any)?.data || listed
  const shipping = data?.shipping_address || data?.data?.shipping_address || data
  const arr = Array.isArray(shipping)
    ? shipping
    : Array.isArray(data)
      ? data
      : []

  const names = new Set<string>()
  for (const row of arr) {
    const n = String(row?.pickup_location || row?.pickup_location_name || row?.name || "").trim()
    if (n) names.add(n.toLowerCase())
  }
  return names
}

function positiveNumber(raw: unknown): number | null {
  const n = typeof raw === "string" ? parseFloat(raw) : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Medusa stores weight in grams. Vendor portal sometimes saves small numbers as kg.
 * Values >= 20 are treated as grams; smaller values as kg.
 */
export function toShiprocketWeightKg(raw: unknown): number | null {
  const n = positiveNumber(raw)
  if (n == null) return null
  if (n >= 20) return Number((n / 1000).toFixed(3))
  return Number(n.toFixed(3))
}

/**
 * Aggregate package size from vendor line items' product/variant dimensions.
 * Weight is summed (× qty). Dimensions use max length/width/height across items.
 */
export async function estimatePackageFromVendorItems(
  req: MedusaRequest,
  vendorItems: any[]
): Promise<PackageEstimate> {
  const defaultLength = Number(process.env.SHIPROCKET_DEFAULT_LENGTH || 10)
  const defaultBreadth = Number(process.env.SHIPROCKET_DEFAULT_BREADTH || 10)
  const defaultHeight = Number(process.env.SHIPROCKET_DEFAULT_HEIGHT || 10)
  const defaultWeight = Number(process.env.SHIPROCKET_DEFAULT_WEIGHT || 0.5)

  const productIds = Array.from(
    new Set(
      (vendorItems || [])
        .map((item) => item.product_id || item.variant?.product_id)
        .filter(Boolean)
    )
  ) as string[]

  if (!productIds.length) {
    return {
      weight: defaultWeight,
      length: defaultLength,
      breadth: defaultBreadth,
      height: defaultHeight,
      source: "default",
      product_count: 0,
      notes: "No product ids on order items",
    }
  }

  const query = req.scope.resolve("query")
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "weight",
      "length",
      "height",
      "width",
      "variants.id",
      "variants.weight",
      "variants.length",
      "variants.height",
      "variants.width",
    ],
    filters: { id: productIds },
  })

  const byId = new Map<string, any>((products || []).map((p: any) => [p.id, p]))
  let totalWeightKg = 0
  let maxLength = 0
  let maxBreadth = 0
  let maxHeight = 0
  let foundAny = false

  for (const item of vendorItems || []) {
    const productId = item.product_id || item.variant?.product_id
    const product = productId ? byId.get(productId) : null
    if (!product) continue

    const variantId = item.variant_id || item.variant?.id
    const variant =
      (product.variants || []).find((v: any) => v.id === variantId) ||
      (product.variants || [])[0] ||
      null

    const qty = getItemUnits(item)
    const weightRaw = positiveNumber(variant?.weight) ?? positiveNumber(product.weight)
    const lengthRaw = positiveNumber(variant?.length) ?? positiveNumber(product.length)
    const heightRaw = positiveNumber(variant?.height) ?? positiveNumber(product.height)
    const widthRaw = positiveNumber(variant?.width) ?? positiveNumber(product.width)

    const weightKg = toShiprocketWeightKg(weightRaw)
    if (weightKg != null) {
      totalWeightKg += weightKg * qty
      foundAny = true
    }
    if (lengthRaw != null) {
      maxLength = Math.max(maxLength, lengthRaw)
      foundAny = true
    }
    if (widthRaw != null) {
      maxBreadth = Math.max(maxBreadth, widthRaw)
      foundAny = true
    }
    if (heightRaw != null) {
      maxHeight = Math.max(maxHeight, heightRaw)
      foundAny = true
    }
  }

  if (!foundAny) {
    return {
      weight: defaultWeight,
      length: defaultLength,
      breadth: defaultBreadth,
      height: defaultHeight,
      source: "default",
      product_count: productIds.length,
      notes: "Products missing weight/dimensions — using defaults",
    }
  }

  return {
    weight: totalWeightKg > 0 ? Number(totalWeightKg.toFixed(3)) : defaultWeight,
    length: maxLength > 0 ? maxLength : defaultLength,
    breadth: maxBreadth > 0 ? maxBreadth : defaultBreadth,
    height: maxHeight > 0 ? maxHeight : defaultHeight,
    source: "product",
    product_count: productIds.length,
  }
}
