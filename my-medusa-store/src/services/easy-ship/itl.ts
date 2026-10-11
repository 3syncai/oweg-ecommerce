import type {
  EasyShipCreateResult,
  EasyShipPickupAddress,
  EasyShipProvider,
  EasyShipServiceabilityInput,
} from "./types"

/**
 * Live iThink Logistics (ITL) HTTP client skeleton.
 * Gated by ITL_MODE=live — requires ITL_ACCESS_TOKEN + ITL_SECRET_KEY.
 * Booking endpoints are stubbed until full api_v3 docs/credentials are supplied.
 */
export class ItlProvider implements EasyShipProvider {
  readonly name = "itl" as const
  readonly displayName = "ITL"

  private get baseUrl() {
    return (
      process.env.ITL_BASE_URL || "https://api.ithinklogistics.com/api_v3"
    ).replace(/\/$/, "")
  }

  private get accessToken() {
    return String(process.env.ITL_ACCESS_TOKEN || "").trim()
  }

  private get secretKey() {
    return String(process.env.ITL_SECRET_KEY || "").trim()
  }

  private assertConfigured() {
    if (!this.accessToken || !this.secretKey) {
      throw new Error(
        "ITL live mode is not configured. Set ITL_ACCESS_TOKEN and ITL_SECRET_KEY, or use ITL_MODE=dummy."
      )
    }
  }

  private authBody(extra: Record<string, unknown> = {}) {
    return {
      data: {
        access_token: this.accessToken,
        secret_key: this.secretKey,
        ...extra,
      },
    }
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    this.assertConfigured()
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`
    console.log(`[ITL] Request POST ${url}`)
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[ITL] Error ${res.status} ${path}: ${text}`)
      throw new Error(`ITL error ${res.status}: ${text}`)
    }
    return (await res.json()) as T
  }

  async listCouriers(input: EasyShipServiceabilityInput): Promise<{
    couriers: import("./types").EasyShipCourier[]
    rawAvailableCount: number | null
    raw?: Record<string, unknown>
  }> {
    this.assertConfigured()
    const rateUrl = "https://my.ithinklogistics.com/api_v3/rate/check.json"
    const length = Math.max(1, Math.round(input.length || 10))
    const breadth = Math.max(1, Math.round(input.breadth || 10))
    const height = Math.max(1, Math.round(input.height || 10))
    let weight = input.weight != null && input.weight > 0 ? input.weight : 0.5
    // If weight passed in grams (> 20), convert to kg
    if (weight > 20) {
      weight = Number((weight / 1000).toFixed(2))
    }

    const payload = {
      data: {
        from_pincode: input.pickup_postcode,
        to_pincode: input.delivery_postcode,
        shipping_length_cms: length,
        shipping_width_cms: breadth,
        shipping_height_cms: height,
        shipping_weight_kg: weight,
        order_type: input.is_return ? "reverse" : "forward",
        payment_method: input.cod ? "COD" : "Prepaid",
        service_type: "surface",
        product_mrp: input.declared_value && input.declared_value > 0 ? input.declared_value : 1000,
        access_token: this.accessToken,
        secret_key: this.secretKey,
      },
    }

    console.log(`[ITL] Request POST ${rateUrl} from=${input.pickup_postcode} to=${input.delivery_postcode} wt=${weight}kg`)
    const res = await fetch(rateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`[ITL] Error ${res.status} rate/check.json: ${text}`)
      throw new Error(`ITL rate check error ${res.status}: ${text}`)
    }

    const body = (await res.json()) as any
    if (body.status === "error" || !Array.isArray(body.data)) {
      console.warn(`[ITL] Rate check returned error: ${body.html_message || "Invalid response"}`)
      throw new Error(body.html_message || "Failed to fetch ITL couriers")
    }

    const couriers: import("./types").EasyShipCourier[] = body.data.map((c: any) => ({
      courier_id: Number(c.logistic_id) || Math.floor(Math.random() * 9000),
      courier_name: String(c.logistic_name || "ITL Partner"),
      rate: Number(c.rate) || 0,
      freight_charge: Number(c.freight_charges) || Number(c.rate) || 0,
      rto_charges: Number(c.rto_charges) || 0,
      cod_charges: Number(c.cod_charges) || 0,
      charge_weight: Number(c.weight_slab) || null,
      cod: c.cod === "Y",
      is_surface: String(c.service_type || "").toLowerCase() === "surface",
      rating: 4.5,
      etd: c.delivery_tat ? `${c.delivery_tat} days` : null,
    }))

    return {
      couriers,
      rawAvailableCount: couriers.length,
      raw: body,
    }
  }

  async ensurePickup(address: EasyShipPickupAddress) {
    this.assertConfigured()
    // Warehouse/pickup registration depends on ITL account setup; pass through nickname for now.
    return {
      pickup_location: address.pickup_location,
      pin_code: address.pin_code,
    }
  }

  async createForwardShipment(_payload: Record<string, unknown>): Promise<EasyShipCreateResult> {
    this.assertConfigured()
    throw new Error(
      "ITL live createForwardShipment is not implemented yet. Use ITL_MODE=dummy until manifestation API is wired."
    )
  }

  async createReversePickup(_payload: Record<string, unknown>): Promise<EasyShipCreateResult> {
    this.assertConfigured()
    throw new Error(
      "ITL live createReversePickup is not implemented yet. Use ITL_MODE=dummy until reverse API is wired."
    )
  }

  async assignAwb(
    _shipmentId: string | number,
    _courierId: number
  ): Promise<{ awb: string | null; raw?: Record<string, unknown> }> {
    this.assertConfigured()
    throw new Error(
      "ITL live assignAwb is not implemented yet. Use ITL_MODE=dummy until AWB assignment API is wired."
    )
  }

  async trackByAwb(awb: string) {
    const data = await this.request<Record<string, unknown>>("/order/track.json", this.authBody({
      awb_number_list: String(awb),
    }))

    // Normalize common iThink shapes into the extractTrackingStatus candidates.
    const root = (data as any)?.data || data
    const first =
      (Array.isArray(root) ? root[0] : null) ||
      root?.[awb] ||
      root?.tracking ||
      root

    const status =
      first?.current_status ||
      first?.status ||
      first?.order_status ||
      (data as any)?.current_status ||
      "in_transit"

    const activities = Array.isArray(first?.history)
      ? first.history
      : Array.isArray(first?.scan)
        ? first.scan
        : []

    return {
      current_status: status,
      status,
      tracking_data: {
        courier_name: first?.courier_name || first?.logistic_name || "ITL",
        shipment_track: [
          {
            awb_code: awb,
            current_status: status,
            courier_name: first?.courier_name || "ITL",
          },
        ],
        shipment_track_activities: activities.map((a: any) => ({
          date: a?.date || a?.datetime || a?.updated_at || null,
          status: a?.status || a?.activity || a?.scan || null,
          location: a?.location || a?.city || null,
          activity: a?.activity || a?.status || a?.scan || null,
        })),
      },
      raw: data,
    }
  }

  async cancelOrders(_orderIds: string[]): Promise<Record<string, unknown>> {
    this.assertConfigured()
    throw new Error(
      "ITL live cancelOrders is not implemented yet. Use ITL_MODE=dummy until cancel API is wired."
    )
  }

  trackingUrlForAwb(awb: string) {
    return `https://www.ithinklogistics.com/track-order?awb=${encodeURIComponent(awb)}`
  }
}
