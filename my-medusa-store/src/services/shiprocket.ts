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
