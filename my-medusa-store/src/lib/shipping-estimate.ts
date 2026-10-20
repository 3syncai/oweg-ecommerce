import type { EasyShipCourier } from "../services/easy-ship/types"

export const ESTIMATE_TTL_MS = 15 * 60 * 1000
export const BENCHMARK_DESTINATIONS = [
  { pincode: "400001", label: "Mumbai" }, { pincode: "110001", label: "Delhi" },
  { pincode: "560001", label: "Bengaluru" }, { pincode: "600001", label: "Chennai" },
  { pincode: "700001", label: "Kolkata" }, { pincode: "781001", label: "Guwahati" },
  { pincode: "190001", label: "Srinagar" }, { pincode: "194101", label: "Leh" },
  { pincode: "744101", label: "Port Blair" },
]

export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export const validPincode = (value: string) => /^[1-9]\d{5}$/.test(value)

export function packedPackage(input: Record<string, unknown>) {
  const result = {} as Record<"length" | "width" | "height" | "weight", number>
  for (const field of ["length", "width", "height", "weight"] as const) {
    const text = String(input[field] ?? "").trim()
    const value = Number(text)
    if (!/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(value) || value <= 0) throw new Error(`Packed ${field} must be positive (${field === "weight" ? "kg" : "cm"})`)
    result[field] = field === "weight" ? value : Math.ceil(value)
    if (field !== "weight" && result[field] > 1000) throw new Error("Packed dimensions exceed ITL's 1000 cm limit; request a manual quote")
  }
  const volumetric = result.length * result.width * result.height / 5000
  if (result.weight > 10 || volumetric > 10) throw new Error("Package exceeds the automatic 10 kg actual/estimated volumetric limit; request a manual shipping quote")
  return { ...result, volumetric_weight: Number(volumetric.toFixed(4)), applied_weight: Number(Math.max(result.weight, volumetric).toFixed(4)) }
}

/** Compare carrier totals, retaining their explicit GST instead of taxing freight twice. */
export function economicalCourier(couriers: EasyShipCourier[]) {
  return couriers.filter(c => c.is_surface && c.prepaid === true && c.pickup_available === true)
    .flatMap(c => {
      const total = c.rate, tax = c.gst_amount, freight = c.freight_charge
      if (total == null || tax == null || freight == null || ![total, tax, freight].every(Number.isFinite) || total <= 0 || tax < 0 || freight < 0 || tax >= total) return []
      const basic = money(total - tax)
      // Existing calculators apply 18% once. Reject an incompatible breakdown rather than guess.
      if (Math.abs(money(basic * .18) - tax) > .02 || basic + .02 < freight) return []
      return [{ courier_name: c.courier_name, freight_charge: basic, carrier_freight: freight, other_carrier_charges: money(Math.max(0, basic - freight)), gst_amount: tax, total_logistics_fee: total, carrier_weight_slab: c.charge_weight, etd: c.etd }]
    }).sort((a, b) => a.total_logistics_fee - b.total_logistics_fee)[0]
}

export async function compareShippingRoutes(pickup: string, destinations: { pincode: string; label: string }[], load: (pin: string) => Promise<EasyShipCourier[]>) {
  const results = new Array<{ pincode: string; label: string; status: "quoted" | "unavailable" | "error"; quote?: NonNullable<ReturnType<typeof economicalCourier>> }>(destinations.length)
  let next = 0
  async function worker() {
    while (next < destinations.length) {
      const index = next++, destination = destinations[index]
      try {
        const couriers = await load(destination.pincode)
        const quote = economicalCourier(couriers)
        const eligible = couriers.some(c => c.is_surface && c.prepaid === true && c.pickup_available === true)
        results[index] = { ...destination, status: quote ? "quoted" : eligible ? "error" : "unavailable", ...(quote ? { quote } : {}) }
      } catch { results[index] = { ...destination, status: "error" } }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  const served = results.filter(r => r.quote)
  const highest = served.sort((a, b) => b.quote!.total_logistics_fee - a.quote!.total_logistics_fee)[0]
  if (!highest) throw new Error("No eligible prepaid surface quote is available. Request a manual shipping quote.")
  return { ...highest.quote!, pickup_pincode: pickup, delivery_pincode: highest.pincode, destination_label: highest.label, routes: results, coverage_complete: !results.some(r => r.status === "error") }
}
