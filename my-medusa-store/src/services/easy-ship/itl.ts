import type {
  EasyShipCourier,
  EasyShipCreateResult,
  EasyShipPickupAddress,
  EasyShipProvider,
  EasyShipServiceabilityInput,
} from "./types"

/**
 * Live iThink Logistics (ITL) Easy Ship provider.
 * Gated by ITL_MODE=live — requires ITL_ACCESS_TOKEN + ITL_SECRET_KEY.
 *
 * Endpoints (prod):
 * - Rates:     https://my.ithinklogistics.com/api_v3/rate/check.json
 * - Order add: https://my.ithinklogistics.com/api_v3/order/add.json
 * - Cancel:    https://my.ithinklogistics.com/api_v3/order/cancel.json
 * - Track:     https://api.ithinklogistics.com/api_v3/order/track.json
 * - Warehouse: https://my.ithinklogistics.com/api_v3/warehouse/{get,add}.json
 */

const STORE_API_BASE =
  process.env.ITL_STORE_API_BASE || "https://my.ithinklogistics.com/api_v3"
const TRACK_API_BASE =
  process.env.ITL_BASE_URL || "https://api.ithinklogistics.com/api_v3"

const LOGISTICS_SLUGS = [
  "delhivery",
  "bluedart",
  "xpressbees",
  "ecom",
  "ekart",
  "fedex",
  "dtdc",
  "shadowfax",
  "maruti",
] as const

function stableCourierId(name: string): number {
  const key = String(name || "itl").trim().toLowerCase()
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  // Keep out of dummy range (9000+) and positive
  return 1000 + (hash % 8000)
}

function normalizeLogistics(name: string | null | undefined): string {
  const raw = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
  if (!raw) return ""
  for (const slug of LOGISTICS_SLUGS) {
    if (raw.includes(slug) || slug.includes(raw)) return slug
  }
  // Common aliases
  if (raw.includes("ecomexpress") || raw === "ecomexpress") return "ecom"
  if (raw.includes("xpress")) return "xpressbees"
  if (raw.includes("blue")) return "bluedart"
  if (raw.includes("delh")) return "delhivery"
  if (raw.includes("ekart") || raw.includes("flipkart")) return "ekart"
  return raw
}

function formatOrderDate(isoOrDate: string | Date | null | undefined): string {
  const d = isoOrDate ? new Date(isoOrDate) : new Date()
  if (Number.isNaN(d.getTime())) {
    const now = new Date()
    const dd = String(now.getDate()).padStart(2, "0")
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const yyyy = now.getFullYear()
    return `${dd}-${mm}-${yyyy}`
  }
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

function phone10(raw: unknown): string {
  const digits = String(raw || "").replace(/\D/g, "")
  if (digits.length >= 10) return digits.slice(-10)
  return digits || "9999999999"
}

function encodeWarehousePickup(id: string | number): string {
  return `ITLWH:${id}`
}

export function parseItlWarehouseId(
  pickupLocation: string | null | undefined
): string | null {
  const raw = String(pickupLocation || "").trim()
  const m = /^ITLWH:(\d+)$/i.exec(raw)
  if (m) return m[1]
  if (/^\d+$/.test(raw)) return raw
  return null
}

function fuzzyIncludes(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

export class ItlProvider implements EasyShipProvider {
  readonly name = "itl" as const
  readonly displayName = "ITL"

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

  private authFields() {
    return {
      access_token: this.accessToken,
      secret_key: this.secretKey,
    }
  }

  private async postJson(
    url: string,
    data: Record<string, unknown>,
    label: string
  ): Promise<any> {
    this.assertConfigured()
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cache-control": "no-cache",
      },
      body: JSON.stringify({ data: { ...data, ...this.authFields() } }),
    })
    const text = await res.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      throw new Error(
        `ITL ${label} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 240)}`
      )
    }
    const status = String(json?.status || "").toLowerCase()
    const code = Number(json?.status_code || res.status)
    const msg =
      json?.html_message ||
      json?.message ||
      json?.error ||
      json?.data?.message ||
      ""
    if (!res.ok || (status && status !== "success" && status !== "ok" && code >= 400)) {
      throw new Error(
        `ITL ${label} failed (HTTP ${res.status}${code ? ` / ${code}` : ""}): ${
          msg || text.slice(0, 240) || "unknown error"
        }`
      )
    }
    if (msg && /not serviceable|non[- ]?serviceable|pincode.*not|no service/i.test(String(msg))) {
      const err = new Error(String(msg)) as Error & { code?: string }
      err.code = "PINCODE_NOT_SERVICEABLE"
      throw err
    }
    return json
  }

  async listCouriers(input: EasyShipServiceabilityInput): Promise<{
    couriers: EasyShipCourier[]
    rawAvailableCount: number | null
    raw?: Record<string, unknown>
  }> {
    // ITL rate API: weight in kg (max 10), dimensions in cm (ceil).
    const weight = Math.min(
      10,
      Math.max(0.1, Number(input.weight) > 0 ? Number(input.weight) : 0.5)
    )
    const length = Math.min(1000, Math.max(1, Math.ceil(Number(input.length) || 10)))
    const breadth = Math.min(1000, Math.max(1, Math.ceil(Number(input.breadth) || 10)))
    const height = Math.min(1000, Math.max(1, Math.ceil(Number(input.height) || 10)))
    const mrp =
      input.declared_value != null && Number(input.declared_value) > 0
        ? Number(input.declared_value)
        : 500

    const json = await this.postJson(
      `${STORE_API_BASE}/rate/check.json`,
      {
        from_pincode: String(input.pickup_postcode || "").replace(/\D/g, ""),
        to_pincode: String(input.delivery_postcode || "").replace(/\D/g, ""),
        shipping_length_cms: String(length),
        shipping_width_cms: String(breadth),
        shipping_height_cms: String(height),
        shipping_weight_kg: String(weight),
        order_type: input.is_return ? "reverse" : "forward",
        payment_method: input.cod ? "COD" : "Prepaid",
        product_mrp: String(mrp),
      },
      "rate/check"
    )

    const rows: any[] = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.data?.data)
        ? json.data.data
        : typeof json?.data === "object" && json.data
          ? Object.values(json.data)
          : []

    const couriers: EasyShipCourier[] = []
    for (const row of rows) {
      if (!row || typeof row !== "object") continue
      const logisticName = String(
        row.logistic_name || row.logistics_name || row.name || ""
      ).trim()
      if (!logisticName) continue

      const prepaidOk =
        String(row.prepaid || "Y").toUpperCase() !== "N"
      const codOk = String(row.cod || "Y").toUpperCase() !== "N"
      const pickupOk =
        String(row.pickup || row.rev_pickup || "Y").toUpperCase() !== "N"

      if (input.cod && !codOk) continue
      if (!input.cod && !prepaidOk) continue
      if (!pickupOk) continue

      // ITL `rate` = freight + COD fee + GST (payable total). Keep components separate.
      const totalRaw = Number(row.rate ?? row.total_rate)
      const freightRaw = Number(
        row.freight_charges ?? row.freight_charge ?? row.freight
      )
      const gstRaw = Number(row.gst_charges ?? row.gst_amount ?? row.gst)
      const codRaw = Number(row.cod_charges ?? row.cod_charge)
      const rtoRaw = Number(row.rto_charges ?? row.rto_charge)
      const slabRaw = Number(row.weight_slab ?? row.charge_weight)

      const rate = Number.isFinite(totalRaw) ? totalRaw : null
      const freight =
        Number.isFinite(freightRaw) && freightRaw >= 0 ? freightRaw : null
      const gst = Number.isFinite(gstRaw) && gstRaw >= 0 ? gstRaw : null
      const codCharges =
        Number.isFinite(codRaw) && codRaw >= 0 ? codRaw : null
      const rtoCharges =
        Number.isFinite(rtoRaw) && rtoRaw >= 0 ? rtoRaw : null
      const chargeWeight =
        Number.isFinite(slabRaw) && slabRaw > 0 ? slabRaw : weight

      const etd =
        row.delivery_tat != null
          ? `${row.delivery_tat} day(s)`
          : json?.expected_delivery_date || null
      const serviceType = String(
        row.logistic_service_type || row.service_type || ""
      ).toLowerCase()

      couriers.push({
        courier_id: Number(row.logistic_id) || stableCourierId(logisticName),
        courier_name: logisticName,
        rate,
        etd,
        freight_charge: freight,
        rto_charges: rtoCharges,
        cod_charges: codCharges,
        charge_weight: chargeWeight,
        cod: codOk,
        is_surface: /surface|ground/.test(serviceType),
        rating: null,
        prepaid: prepaidOk,
        pickup_available: pickupOk,
        gst_amount: gst,
      })
    }

    if (!couriers.length) {
      const err = new Error(
        `No ITL couriers serviceable for ${input.pickup_postcode} → ${input.delivery_postcode}. Admin can retry when the pincode becomes serviceable.`
      ) as Error & { code?: string }
      err.code = "PINCODE_NOT_SERVICEABLE"
      throw err
    }

    couriers.sort((a, b) => (a.rate ?? 1e9) - (b.rate ?? 1e9))
    return {
      couriers,
      rawAvailableCount: couriers.length,
      raw: json,
    }
  }

  private async listWarehouses(): Promise<any[]> {
    const json = await this.postJson(
      `${STORE_API_BASE}/warehouse/get.json`,
      {},
      "warehouse/get"
    )
    if (Array.isArray(json?.data)) return json.data
    if (Array.isArray(json?.data?.data)) return json.data.data
    return []
  }

  private async resolveStateCityIds(
    stateName: string,
    cityName: string
  ): Promise<{ state_id: string; city_id: string }> {
    const envState = String(process.env.ITL_DEFAULT_STATE_ID || "").trim()
    const envCity = String(process.env.ITL_DEFAULT_CITY_ID || "").trim()
    if (envState && envCity) {
      return { state_id: envState, city_id: envCity }
    }

    const statesJson = await this.postJson(
      `${STORE_API_BASE}/state/get.json`,
      { country_id: "101" },
      "state/get"
    )
    const states: any[] = Array.isArray(statesJson?.data) ? statesJson.data : []
    const state =
      states.find((s) =>
        fuzzyIncludes(String(s.state_name || s.name || ""), stateName)
      ) || null
    if (!state?.id) {
      throw new Error(
        `ITL could not resolve state_id for "${stateName}". Set ITL_DEFAULT_STATE_ID / ITL_DEFAULT_CITY_ID, or fix vendor address state.`
      )
    }

    const citiesJson = await this.postJson(
      `${STORE_API_BASE}/city/get.json`,
      { state_id: String(state.id) },
      "city/get"
    )
    const cities: any[] = Array.isArray(citiesJson?.data) ? citiesJson.data : []
    const city =
      cities.find((c) =>
        fuzzyIncludes(String(c.city_name || c.name || ""), cityName)
      ) || cities[0]
    if (!city?.id) {
      throw new Error(
        `ITL could not resolve city_id for "${cityName}" in state "${stateName}". Set ITL_DEFAULT_CITY_ID.`
      )
    }
    return { state_id: String(state.id), city_id: String(city.id) }
  }

  async ensurePickup(address: EasyShipPickupAddress) {
    this.assertConfigured()

    const envWarehouse = String(
      process.env.ITL_PICKUP_ADDRESS_ID || process.env.ITL_WAREHOUSE_ID || ""
    ).trim()
    const pin = String(address.pin_code || "").replace(/\D/g, "")

    // Prefer matching an already-registered warehouse for this vendor pin/name
    try {
      const warehouses = await this.listWarehouses()
      const company = String(address.vendor_name || address.name || "").trim()
      const match =
        warehouses.find((w) => {
          const wPin = String(w.pincode || w.pin_code || "").replace(/\D/g, "")
          const wName = String(w.company_name || "").trim()
          const pinOk = pin && wPin && wPin === pin
          const nameOk = company && wName && fuzzyIncludes(wName, company)
          const statusOk = !w.status || /approv|active|1/i.test(String(w.status))
          return pinOk && (nameOk || !company) && statusOk
        }) ||
        warehouses.find((w) => {
          const wPin = String(w.pincode || w.pin_code || "").replace(/\D/g, "")
          return pin && wPin && wPin === pin
        })

      if (match?.id) {
        return {
          pickup_location: encodeWarehousePickup(match.id),
          pin_code: pin || address.pin_code,
        }
      }
    } catch (e: any) {
      console.warn("[ITL] warehouse/get failed:", e?.message)
    }

    if (envWarehouse) {
      return {
        pickup_location: encodeWarehousePickup(envWarehouse),
        pin_code: pin || address.pin_code,
      }
    }

    // Register a new warehouse for this vendor pickup
    const { state_id, city_id } = await this.resolveStateCityIds(
      address.state,
      address.city
    )
    const addJson = await this.postJson(
      `${STORE_API_BASE}/warehouse/add.json`,
      {
        company_name: String(address.vendor_name || address.name || "Vendor").slice(
          0,
          80
        ),
        address1: String(address.address || "").slice(0, 120),
        address2: String(address.address_2 || "").slice(0, 120),
        mobile: phone10(address.phone),
        pincode: pin,
        city_id,
        state_id,
        country_id: "101",
      },
      "warehouse/add"
    )

    const warehouseId =
      addJson?.warehouse_id ||
      addJson?.data?.warehouse_id ||
      addJson?.data?.id ||
      null
    if (!warehouseId) {
      throw new Error(
        `ITL warehouse/add succeeded but returned no warehouse_id: ${JSON.stringify(addJson).slice(0, 240)}`
      )
    }

    console.log(
      `[ITL] Registered warehouse id=${warehouseId} pin=${pin} (may need partner approval before pickup)`
    )

    return {
      pickup_location: encodeWarehousePickup(warehouseId),
      pin_code: pin || address.pin_code,
    }
  }

  private resolvePickupAddressId(payload: Record<string, unknown>): string {
    const fromPayload =
      payload.pickup_address_id ||
      payload.itl_pickup_address_id ||
      parseItlWarehouseId(String(payload.pickup_location || ""))
    if (fromPayload) return String(fromPayload)

    const envWarehouse = String(
      process.env.ITL_PICKUP_ADDRESS_ID || process.env.ITL_WAREHOUSE_ID || ""
    ).trim()
    if (envWarehouse) return envWarehouse

    throw new Error(
      "ITL pickup_address_id missing. Register vendor warehouse (ensurePickup) or set ITL_PICKUP_ADDRESS_ID."
    )
  }

  private buildShipmentFromShiprocketPayload(
    payload: Record<string, unknown>,
    opts: { orderType: "forward" | "reverse" }
  ) {
    const orderId = String(payload.order_id || `OWEG-${Date.now()}`)
    const orderDate = formatOrderDate(
      (payload.order_date as string) || new Date().toISOString()
    )
    const paymentMethod = String(payload.payment_method || "Prepaid")
      .toLowerCase()
      .includes("cod")
      ? "COD"
      : "Prepaid"

    const length = Number(payload.length) > 0 ? Number(payload.length) : 10
    const breadth = Number(payload.breadth) > 0 ? Number(payload.breadth) : 10
    const height = Number(payload.height) > 0 ? Number(payload.height) : 10
    const weightKg = Number(payload.weight) > 0 ? Number(payload.weight) : 0.5
    // ITL add-order samples use gram-scale integers for small parcels
    const weightGrams = Math.max(50, Math.round(weightKg * 1000))

    const items = Array.isArray(payload.order_items) ? payload.order_items : []
    const products = items.map((item: any) => ({
      product_name: String(item.name || "Item").slice(0, 120),
      product_sku: String(item.sku || "SKU").slice(0, 60),
      product_quantity: String(
        Number(item.units) > 0 ? Math.round(Number(item.units)) : 1
      ),
      product_price: String(
        Number(item.selling_price) >= 0 ? Number(item.selling_price) : 0
      ),
      product_tax_rate: "0",
      product_hsn_code: "",
      product_discount: "0",
      product_img_url: "",
    }))
    if (!products.length) {
      throw new Error("ITL create: no order_items to ship")
    }

    const subTotal = Number(payload.sub_total)
    const totalAmount = Number.isFinite(subTotal)
      ? subTotal
      : products.reduce(
          (s, p) => s + Number(p.product_price) * Number(p.product_quantity),
          0
        )

    const custName = String(
      payload.billing_customer_name ||
        `${payload.shipping_customer_name || ""}`.trim() ||
        "Customer"
    )
    const add1 = String(
      payload.shipping_address || payload.billing_address || ""
    ).slice(0, 120)
    const add2 = String(
      payload.shipping_address_2 || payload.billing_address_2 || ""
    ).slice(0, 120)
    const pin = String(
      payload.shipping_pincode || payload.billing_pincode || ""
    ).replace(/\D/g, "")
    const city = String(payload.shipping_city || payload.billing_city || "")
    const state = String(payload.shipping_state || payload.billing_state || "")
    const phone = phone10(payload.shipping_phone || payload.billing_phone)
    const email = String(payload.billing_email || payload.shipping_email || "")

    const returnAddressId =
      String(
        payload.return_address_id ||
          process.env.ITL_RETURN_ADDRESS_ID ||
          process.env.ITL_PICKUP_ADDRESS_ID ||
          ""
      ).trim() || this.resolvePickupAddressId(payload)

    const shipment: Record<string, unknown> = {
      waybill: "",
      order: orderId.slice(0, 40),
      sub_order: String(payload.sub_order || "").slice(0, 20),
      order_date: orderDate,
      total_amount: String(Math.round(totalAmount * 100) / 100),
      name: custName.slice(0, 80),
      company_name: "",
      add: add1 || "Address",
      add2,
      add3: "",
      pin,
      city,
      state,
      country: "India",
      phone,
      alt_phone: phone,
      email,
      is_billing_same_as_shipping: "yes",
      billing_name: custName.slice(0, 80),
      billing_company_name: "",
      billing_add: String(payload.billing_address || add1 || "Address").slice(
        0,
        120
      ),
      billing_add2: String(payload.billing_address_2 || add2).slice(0, 120),
      billing_add3: "",
      billing_pin: String(payload.billing_pincode || pin).replace(/\D/g, ""),
      billing_city: String(payload.billing_city || city),
      billing_state: String(payload.billing_state || state),
      billing_country: "India",
      billing_phone: phone10(payload.billing_phone || phone),
      billing_alt_phone: "",
      billing_email: email,
      products,
      shipment_length: String(Math.round(length)),
      shipment_width: String(Math.round(breadth)),
      shipment_height: String(Math.round(height)),
      weight: String(weightGrams),
      shipping_charges: "0",
      giftwrap_charges: "0",
      transaction_charges: "0",
      total_discount: "0",
      first_attemp_discount: "0",
      cod_charges: "0",
      advance_amount: "0",
      cod_amount:
        paymentMethod === "COD"
          ? String(Math.round(totalAmount * 100) / 100)
          : "0",
      payment_mode: paymentMethod,
      reseller_name: "",
      eway_bill_number: "",
      gst_number: String(payload.gstin || ""),
      what3words: "",
      return_address_id: String(returnAddressId),
    }

    if (process.env.ITL_API_SOURCE) {
      shipment.api_source = String(process.env.ITL_API_SOURCE)
    }
    if (process.env.ITL_STORE_ID) {
      shipment.store_id = String(process.env.ITL_STORE_ID)
    }

    return { shipment, orderId, paymentMethod, orderType: opts.orderType }
  }

  async createForwardShipment(
    payload: Record<string, unknown>
  ): Promise<EasyShipCreateResult> {
    const pickupAddressId = this.resolvePickupAddressId(payload)
    const logistics = normalizeLogistics(
      String(payload.courier_name || payload.logistics || "")
    )
    const { shipment, orderId } = this.buildShipmentFromShiprocketPayload(
      payload,
      { orderType: "forward" }
    )

    // For reverse payloads reused incorrectly, force forward
    const body: Record<string, unknown> = {
      shipments: [shipment],
      pickup_address_id: String(pickupAddressId),
      order_type: "",
      s_type: payload.s_type || "",
    }
    if (logistics) body.logistics = logistics

    const json = await this.postJson(
      `${STORE_API_BASE}/order/add.json`,
      body,
      "order/add"
    )

    const dataObj = json?.data && typeof json.data === "object" ? json.data : {}
    const firstKey = Object.keys(dataObj)[0]
    const first =
      (firstKey && dataObj[firstKey]) ||
      (Array.isArray(dataObj) ? dataObj[0] : null) ||
      dataObj

    const status = String(first?.status || json?.status || "").toLowerCase()
    const remark = String(first?.remark || json?.html_message || "")
    if (status && status !== "success" && status !== "ok") {
      const err = new Error(
        remark || `ITL order/add rejected for ${orderId}`
      ) as Error & { code?: string }
      if (/not serviceable|non[- ]?serviceable|pincode/i.test(remark)) {
        err.code = "PINCODE_NOT_SERVICEABLE"
      }
      throw err
    }

    const awb = first?.waybill || first?.awb || first?.awb_number || null
    const trackingUrl =
      first?.tracking_url ||
      (awb ? this.trackingUrlForAwb(String(awb)) : null)

    return {
      order_id: first?.refnum || orderId,
      shipment_id: awb || first?.refnum || orderId,
      awb: awb ? String(awb) : null,
      label_url: trackingUrl,
      tracking_url: trackingUrl,
      raw: json,
    }
  }

  async createReversePickup(
    payload: Record<string, unknown>
  ): Promise<EasyShipCreateResult> {
    const pickupAddressId = this.resolvePickupAddressId(payload)
    const logistics = normalizeLogistics(
      String(payload.courier_name || payload.logistics || "delhivery")
    )
    const { shipment, orderId } = this.buildShipmentFromShiprocketPayload(
      payload,
      { orderType: "reverse" }
    )
    // Reverse: payment prepaid only per ITL docs
    shipment.payment_mode = "Prepaid"
    shipment.cod_amount = "0"

    const body: Record<string, unknown> = {
      shipments: [shipment],
      pickup_address_id: String(pickupAddressId),
      order_type: "reverse",
      s_type: payload.s_type || "",
      logistics: logistics || "delhivery",
    }

    const json = await this.postJson(
      `${STORE_API_BASE}/order/add.json`,
      body,
      "order/add(reverse)"
    )

    const dataObj = json?.data && typeof json.data === "object" ? json.data : {}
    const firstKey = Object.keys(dataObj)[0]
    const first =
      (firstKey && dataObj[firstKey]) ||
      (Array.isArray(dataObj) ? dataObj[0] : null) ||
      dataObj

    const awb = first?.waybill || first?.awb || null
    const trackingUrl =
      first?.tracking_url ||
      (awb ? this.trackingUrlForAwb(String(awb)) : null)

    return {
      order_id: first?.refnum || orderId,
      shipment_id: awb || first?.refnum || orderId,
      awb: awb ? String(awb) : null,
      label_url: trackingUrl,
      tracking_url: trackingUrl,
      raw: json,
    }
  }

  async assignAwb(_shipmentId: string | number, _courierId: number) {
    // ITL order/add returns waybill immediately — no separate assign step
    return { awb: null, raw: { skipped: true, reason: "ITL AWB assigned at create" } }
  }

  async trackByAwb(awb: string): Promise<Record<string, unknown>> {
    const json = await this.postJson(
      `${TRACK_API_BASE}/order/track.json`,
      { awb_number_list: String(awb) },
      "order/track"
    )

    const data = json?.data
    let row: any = null
    if (Array.isArray(data)) {
      row = data[0]
    } else if (data && typeof data === "object") {
      row = data[awb] || data[String(awb)] || Object.values(data)[0]
    }

    const current =
      row?.current_status ||
      row?.status ||
      row?.order_status ||
      row?.shipment_status ||
      "unknown"

    const activities = Array.isArray(row?.scan)
      ? row.scan
      : Array.isArray(row?.scans)
        ? row.scans
        : Array.isArray(row?.tracking_history)
          ? row.tracking_history
          : []

    return {
      current_status: current,
      status: current,
      ndr_reason: row?.ndr_reason || row?.reason || null,
      tracking_data: {
        courier_name: row?.logistic_name || row?.courier_name || null,
        shipment_track: [
          {
            awb_code: awb,
            current_status: current,
            courier_name: row?.logistic_name || null,
          },
        ],
        shipment_track_activities: activities,
      },
      raw: json,
    }
  }

  /**
   * ITL cancel is AWB-based. Callers should pass AWB numbers
   * (we keep the EasyShipProvider cancelOrders name for parity with Shiprocket).
   */
  async cancelOrders(awbOrOrderIds: string[]): Promise<Record<string, unknown>> {
    const awbs = (awbOrOrderIds || [])
      .map((x) => String(x || "").trim())
      .filter(Boolean)
    if (!awbs.length) {
      throw new Error("ITL cancel requires at least one AWB")
    }

    const json = await this.postJson(
      `${STORE_API_BASE}/order/cancel.json`,
      { awb_numbers: awbs.join(",") },
      "order/cancel"
    )
    return { cancelled: awbs, raw: json, status: "ok" }
  }

  trackingUrlForAwb(awb: string) {
    return `https://www.ithinklogistics.com/track-order?awb=${encodeURIComponent(awb)}`
  }
}
