import ShiprocketService from "../shiprocket"
import type {
  EasyShipCourier,
  EasyShipCreateResult,
  EasyShipPickupAddress,
  EasyShipProvider,
  EasyShipServiceabilityInput,
} from "./types"

function normalizeCouriers(raw: Record<string, unknown>): EasyShipCourier[] {
  const root = (raw?.data || raw) as Record<string, any>
  const data =
    root?.available_courier_companies || root?.couriers
      ? root
      : ((root?.data || root) as Record<string, any>)

  const buckets: any[] = []
  const pushList = (value: unknown) => {
    if (!value) return
    if (Array.isArray(value)) {
      buckets.push(...value)
      return
    }
    if (typeof value === "object") {
      buckets.push(value)
    }
  }

  pushList(data?.available_courier_companies)
  pushList(data?.couriers)
  if (buckets.length === 0) {
    pushList(data?.recommended_courier_company)
  }

  const seen = new Set<number>()
  return buckets
    .map((c: any) => {
      const id = Number(c?.courier_company_id ?? c?.id ?? c?.courier_id)
      const name = String(c?.courier_name || c?.name || "").trim()
      if (!Number.isFinite(id) || id <= 0 || !name) return null
      if (seen.has(id)) return null
      seen.add(id)
      return {
        courier_id: id,
        courier_name: name,
        rate: c?.rate != null ? Number(c.rate) : null,
        etd: c?.etd || c?.estimated_delivery_days || c?.edd || null,
        freight_charge: c?.freight_charge != null ? Number(c.freight_charge) : null,
        rto_charges: c?.rto_charges != null ? Number(c.rto_charges) : null,
        cod_charges: c?.cod_charges != null ? Number(c.cod_charges) : null,
        charge_weight: c?.charge_weight != null ? Number(c.charge_weight) : null,
        cod: Boolean(c?.cod),
        is_surface: Boolean(c?.is_surface),
        rating: c?.rating != null ? Number(c.rating) : null,
      } as EasyShipCourier
    })
    .filter(Boolean) as EasyShipCourier[]
}

function extractAwb(response: Record<string, unknown> | null | undefined): string | null {
  if (!response) return null
  const anyRes = response as any
  return (
    anyRes?.awb ||
    anyRes?.awb_code ||
    anyRes?.data?.awb ||
    anyRes?.data?.awb_code ||
    anyRes?.response?.data?.awb_code ||
    null
  )
}

/**
 * Shiprocket-backed Easy Ship provider (rollback / legacy).
 * Pickup registration still goes through ensureVendorShiprocketPickup when using this provider.
 */
export class ShiprocketEasyShipProvider implements EasyShipProvider {
  readonly name = "shiprocket" as const
  readonly displayName = "Shiprocket"
  private client = new ShiprocketService()

  async listCouriers(input: EasyShipServiceabilityInput) {
    const response = await this.client.getServiceability({
      pickup_postcode: input.pickup_postcode,
      delivery_postcode: input.delivery_postcode,
      weight: input.weight,
      length: input.length,
      breadth: input.breadth,
      height: input.height,
      cod: input.cod,
      declared_value: input.declared_value,
      is_return: input.is_return,
    })
    const couriers = normalizeCouriers(response).sort((a, b) => {
      const ar = a.rate == null ? Number.POSITIVE_INFINITY : a.rate
      const br = b.rate == null ? Number.POSITIVE_INFINITY : b.rate
      return ar - br
    })
    const rawData = ((response as any)?.data || response || {}) as Record<string, any>
    const rawAvailable = rawData?.available_courier_companies
    const rawAvailableCount = Array.isArray(rawAvailable) ? rawAvailable.length : null
    return { couriers, rawAvailableCount, raw: response }
  }

  async ensurePickup(address: EasyShipPickupAddress) {
    // Actual Shiprocket pickup API sync is handled by ensureVendorShiprocketPickup.
    return {
      pickup_location: address.pickup_location,
      pin_code: address.pin_code,
    }
  }

  async createForwardShipment(payload: Record<string, unknown>): Promise<EasyShipCreateResult> {
    const response = await this.client.createForwardShipment(payload)
    const anyRes = response as any
    const shipmentId = anyRes?.shipment_id || anyRes?.data?.shipment_id || null
    const orderId = anyRes?.order_id || anyRes?.data?.order_id || null
    const awb = extractAwb(response)
    return {
      order_id: orderId,
      shipment_id: shipmentId,
      awb: awb ? String(awb) : null,
      tracking_url: awb ? this.trackingUrlForAwb(String(awb)) : null,
      raw: response,
    }
  }

  async createReversePickup(payload: Record<string, unknown>): Promise<EasyShipCreateResult> {
    const response = await this.client.createReversePickup(payload)
    const anyRes = response as any
    const orderId = anyRes?.order_id || anyRes?.data?.order_id || null
    const shipmentId = anyRes?.shipment_id || anyRes?.data?.shipment_id || null
    const awb = extractAwb(response)
    return {
      order_id: orderId,
      shipment_id: shipmentId,
      awb: awb ? String(awb) : null,
      tracking_url: awb ? this.trackingUrlForAwb(String(awb)) : null,
      raw: response,
    }
  }

  async assignAwb(shipmentId: string | number, courierId: number) {
    const assigned = await this.client.assignAwb(shipmentId, courierId)
    const awb = extractAwb(assigned)
    return { awb: awb ? String(awb) : null, raw: assigned }
  }

  async trackByAwb(awb: string) {
    return await this.client.trackByAwb(awb)
  }

  async cancelOrders(orderIds: string[]) {
    return await this.client.cancelOrders(orderIds)
  }

  trackingUrlForAwb(awb: string) {
    return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`
  }
}
