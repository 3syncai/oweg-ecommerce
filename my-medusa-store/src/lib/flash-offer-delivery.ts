import { ItlProvider } from "../services/easy-ship/itl"
import type { OfferCandidate } from "./vendor-offer-routing"
import { packedPackage, validPincode } from "./shipping-estimate"

// A listing contains single-unit dimensions. Multi-unit packing is only known at fulfilment.
const routes = new Map<string, { until: number; result: Promise<boolean | undefined> }>()
export async function flashOfferDelivery(offer: OfferCandidate, pin: string, quantity: number, price: number) {
  const pickup = offer.store_pincode || ""
  if (quantity !== 1 || !validPincode(pin) || !validPincode(pickup)) return undefined
  let parcel
  try {
    parcel = packedPackage({ length: offer.parcel_length, width: offer.parcel_width,
      height: offer.parcel_height, weight: offer.parcel_weight })
  } catch { return undefined }
  const key = JSON.stringify([pickup, pin, parcel, price])
  const cached = routes.get(key)
  if (cached && cached.until > Date.now()) return cached.result
  if (routes.size >= 512) routes.delete(routes.keys().next().value!)
  const result = new ItlProvider().listCouriers({ pickup_postcode: pickup, delivery_postcode: pin,
    weight: parcel.weight, length: parcel.length, breadth: parcel.width, height: parcel.height,
    declared_value: price, cod: false }).then(({couriers}) =>
      couriers.some(c => c.pickup_available === true && c.prepaid === true) ? true :
        couriers.length === 0 || couriers.every(c => c.pickup_available === false || c.prepaid === false) ? false : undefined
    ).catch(error => error?.code === "PINCODE_NOT_SERVICEABLE" ? false : undefined)
  routes.set(key, { until: Date.now() + 60_000, result })
  return result
}
