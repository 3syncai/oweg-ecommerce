export type EasyShipProviderName = "itl" | "shiprocket"

export type EasyShipCourier = {
  courier_id: number
  courier_name: string
  rate: number | null
  etd: string | number | null
  freight_charge: number | null
  rto_charges: number | null
  cod_charges: number | null
  charge_weight: number | null
  cod: boolean
  is_surface: boolean
  rating: number | null
}

export type EasyShipServiceabilityInput = {
  pickup_postcode: string
  delivery_postcode: string
  weight?: number
  length?: number
  breadth?: number
  height?: number
  cod?: boolean
  declared_value?: number
  /** Reverse/return serviceability (customer → vendor) */
  is_return?: boolean
}

export type EasyShipPickupAddress = {
  pickup_location: string
  name: string
  email: string
  phone: string
  address: string
  address_2?: string
  city: string
  state: string
  country: string
  pin_code: string
  vendor_name?: string
  gstin?: string
  fingerprint?: string
}

export type EasyShipCreateResult = {
  order_id: string | number | null
  shipment_id: string | number | null
  awb: string | null
  label_url?: string | null
  tracking_url?: string | null
  raw?: Record<string, unknown>
}

export type EasyShipProvider = {
  readonly name: EasyShipProviderName
  readonly displayName: string

  listCouriers(input: EasyShipServiceabilityInput): Promise<{
    couriers: EasyShipCourier[]
    rawAvailableCount: number | null
    raw?: Record<string, unknown>
  }>

  ensurePickup(address: EasyShipPickupAddress): Promise<{
    pickup_location: string
    pin_code: string
  }>

  createForwardShipment(payload: Record<string, unknown>): Promise<EasyShipCreateResult>

  createReversePickup(payload: Record<string, unknown>): Promise<EasyShipCreateResult>

  assignAwb(
    shipmentId: string | number,
    courierId: number
  ): Promise<{ awb: string | null; raw?: Record<string, unknown> }>

  trackByAwb(awb: string): Promise<Record<string, unknown>>

  cancelOrders(orderIds: string[]): Promise<Record<string, unknown>>

  trackingUrlForAwb(awb: string): string
}

export function getConfiguredEasyShipProviderName(): EasyShipProviderName {
  const raw = String(process.env.EASY_SHIP_PROVIDER || "itl")
    .trim()
    .toLowerCase()
  return raw === "shiprocket" ? "shiprocket" : "itl"
}

export function getItlMode(): "dummy" | "live" {
  const raw = String(process.env.ITL_MODE || "dummy")
    .trim()
    .toLowerCase()
  return raw === "live" ? "live" : "dummy"
}

export function easyShipDisplayName(provider?: string | null): string {
  const name = String(provider || getConfiguredEasyShipProviderName())
    .trim()
    .toLowerCase()
  if (name === "itl") return "ITL"
  if (name === "shiprocket") return "Shiprocket"
  return name ? name.toUpperCase() : "ITL"
}
