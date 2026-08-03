type ShiprocketToken = {
  token: string
  expires_at: number
}

class ShiprocketService {
  private tokenCache: ShiprocketToken | null = null

  private get baseUrl() {
    return process.env.SHIPROCKET_BASE_URL || "https://apiv2.shiprocket.in/v1/external"
  }

  private async request<T>(path: string, options: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`
    console.log(`[Shiprocket] Request ${options.method || "GET"} ${url}`)
    const res = await fetch(url, options)
    if (!res.ok) {
      const body = await res.text()
      console.error(`[Shiprocket] Error ${res.status} ${path}: ${body}`)
      throw new Error(`Shiprocket error ${res.status}: ${body}`)
    }
    console.log(`[Shiprocket] Success ${path}`)
    return (await res.json()) as T
  }

  private async getToken(): Promise<string> {
    const now = Date.now()
    if (this.tokenCache && this.tokenCache.expires_at > now + 60000) {
      console.log("[Shiprocket] Using cached token")
      return this.tokenCache.token
    }

    const email = process.env.SHIPROCKET_EMAIL
    const password = process.env.SHIPROCKET_PASSWORD
    if (!email || !password) {
      throw new Error("Shiprocket credentials are missing.")
    }

    console.log("[Shiprocket] Fetching new token")
    const data = await this.request<{ token: string }>(`/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    this.tokenCache = {
      token: data.token,
      expires_at: now + 1000 * 60 * 50,
    }

    return data.token
  }

  async createForwardShipment(payload: Record<string, unknown>) {
    console.log("[Shiprocket] Creating forward shipment")
    const token = await this.getToken()
    return await this.request<Record<string, unknown>>(`/orders/create/adhoc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
  }

  async getServiceability(params: {
    pickup_postcode: string
    delivery_postcode: string
    weight?: number
    length?: number
    breadth?: number
    height?: number
    cod?: boolean
    /** Reverse/return serviceability (customer → vendor/warehouse) */
    is_return?: boolean
  }) {
    const token = await this.getToken()
    const weight = params.weight ?? Number(process.env.SHIPROCKET_DEFAULT_WEIGHT || 0.5)
    const query = new URLSearchParams({
      pickup_postcode: String(params.pickup_postcode),
      delivery_postcode: String(params.delivery_postcode),
      weight: String(weight),
      cod: params.cod ? "1" : "0",
    })
    if (params.length != null && Number.isFinite(params.length) && params.length > 0) {
      query.set("length", String(params.length))
    }
    if (params.breadth != null && Number.isFinite(params.breadth) && params.breadth > 0) {
      query.set("breadth", String(params.breadth))
    }
    if (params.height != null && Number.isFinite(params.height) && params.height > 0) {
      query.set("height", String(params.height))
    }
    if (params.is_return) {
      query.set("is_return", "1")
    }
    return await this.request<Record<string, unknown>>(
      `/courier/serviceability/?${query.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
  }

  async listPickupLocations() {
    const token = await this.getToken()
    return await this.request<Record<string, unknown>>(`/settings/company/pickup`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  }

  async addPickupLocation(payload: Record<string, unknown>) {
    console.log("[Shiprocket] Adding pickup location", payload.pickup_location)
    const token = await this.getToken()
    return await this.request<Record<string, unknown>>(`/settings/company/addpickup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
  }

  async assignAwb(shipmentId: string | number, courierId: number) {
    const token = await this.getToken()
    return await this.request<Record<string, unknown>>(`/courier/assign/awb`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        shipment_id: shipmentId,
        courier_id: courierId,
      }),
    })
  }

  async createReversePickup(payload: Record<string, unknown>) {
    console.log("[Shiprocket] Creating reverse pickup")
    const token = await this.getToken()
    return await this.request<Record<string, unknown>>(`/orders/create/return`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
  }

  async trackByAwb(awb: string) {
    console.log(`[Shiprocket] Tracking AWB ${awb}`)
    const token = await this.getToken()
    return await this.request<Record<string, unknown>>(`/courier/track/awb/${awb}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  }

  async cancelOrders(orderIds: string[]) {
    console.log(`[Shiprocket] Cancelling orders ${orderIds.join(",")}`)
    const token = await this.getToken()
    return await this.request<Record<string, unknown>>(`/orders/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ids: orderIds }),
    })
  }
}

export default ShiprocketService
