import type {
  EasyShipCourier,
  EasyShipCreateResult,
  EasyShipPickupAddress,
  EasyShipProvider,
  EasyShipServiceabilityInput,
} from "./types"

type DummyShipment = {
  order_id: string
  shipment_id: string
  awb: string
  courier_id: number
  courier_name: string
  created_at: number
  track_calls: number
  status: string
  cancelled?: boolean
  ndr_reason?: string | null
  locked?: boolean
  activities: Array<{
    date: string
    status: string
    location: string
    activity: string
  }>
}

const STATUS_LADDER = [
  "awb_assigned",
  "pickup_initiated",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
] as const

/** Process-local store so Track / cron / webhook share dummy shipment state. */
const shipmentsByAwb = new Map<string, DummyShipment>()
const shipmentsByOrderId = new Map<string, DummyShipment>()

const DUMMY_COURIERS: EasyShipCourier[] = [
  {
    courier_id: 9001,
    courier_name: "ITL Express",
    rate: 49,
    etd: "2-3 days",
    freight_charge: 49,
    rto_charges: 35,
    cod_charges: 20,
    charge_weight: null,
    cod: true,
    is_surface: false,
    rating: 4.5,
  },
  {
    courier_id: 9002,
    courier_name: "ITL Surface",
    rate: 35,
    etd: "4-6 days",
    freight_charge: 35,
    rto_charges: 30,
    cod_charges: 15,
    charge_weight: null,
    cod: true,
    is_surface: true,
    rating: 4.1,
  },
  {
    courier_id: 9003,
    courier_name: "ITL Priority",
    rate: 79,
    etd: "1-2 days",
    freight_charge: 79,
    rto_charges: 40,
    cod_charges: 25,
    charge_weight: null,
    cod: true,
    is_surface: false,
    rating: 4.8,
  },
]

function nowIso() {
  return new Date().toISOString()
}

function pushActivity(shipment: DummyShipment, status: string, location = "Dummy Hub") {
  shipment.activities.unshift({
    date: nowIso(),
    status,
    location,
    activity: status.replace(/_/g, " "),
  })
  if (shipment.activities.length > 12) {
    shipment.activities.length = 12
  }
}

function statusFromTrackCalls(trackCalls: number, createdAt: number): string {
  // Advance by call count OR by age (~1 step per 30s) — whichever is further
  const ageSteps = Math.floor((Date.now() - createdAt) / 30_000)
  const index = Math.min(
    STATUS_LADDER.length - 1,
    Math.max(trackCalls, ageSteps)
  )
  return STATUS_LADDER[index]
}

function toTrackPayload(shipment: DummyShipment): Record<string, unknown> {
  return {
    current_status: shipment.status,
    status: shipment.status,
    ndr_reason: shipment.ndr_reason || null,
    tracking_data: {
      courier_name: shipment.courier_name,
      ndr_reason: shipment.ndr_reason || null,
      shipment_track: [
        {
          awb_code: shipment.awb,
          current_status: shipment.status,
          courier_name: shipment.courier_name,
        },
      ],
      shipment_track_activities: shipment.activities,
    },
  }
}

export function getDummyShipmentByAwb(awb: string): DummyShipment | undefined {
  return shipmentsByAwb.get(String(awb))
}

/** Force status for dummy webhook / tests. Recreates stub if process restarted. */
export function forceDummyItlStatus(
  awb: string,
  status: string,
  opts?: { reason?: string | null; courier_name?: string }
): DummyShipment {
  const key = String(awb)
  let shipment = shipmentsByAwb.get(key)
  if (!shipment) {
    const stamp = Date.now()
    shipment = {
      order_id: `ITL-ORD-RECOVERY-${stamp}`,
      shipment_id: `ITL-SHP-RECOVERY-${stamp}`,
      awb: key,
      courier_id: 9001,
      courier_name: opts?.courier_name || "ITL Express",
      created_at: stamp,
      track_calls: 0,
      status: "in_transit",
      activities: [],
      locked: true,
    }
    shipmentsByAwb.set(key, shipment)
    shipmentsByOrderId.set(shipment.order_id, shipment)
  }

  const normalized = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
  shipment.status = normalized || shipment.status
  shipment.locked = true
  if (opts?.reason) {
    shipment.ndr_reason = String(opts.reason).trim().slice(0, 120)
  }
  const location =
    shipment.status === "delivered" || shipment.status === "cash_collected"
      ? "Customer Location"
      : shipment.status.startsWith("rto")
        ? "Return Hub"
        : shipment.status === "ndr"
          ? "Delivery Attempt"
          : "Webhook"
  pushActivity(
    shipment,
    shipment.ndr_reason ? `${shipment.status}:${shipment.ndr_reason}` : shipment.status,
    location
  )
  return shipment
}

export class DummyItlProvider implements EasyShipProvider {
  readonly name = "itl" as const
  readonly displayName = "ITL"

  async listCouriers(input: EasyShipServiceabilityInput) {
    const weight = input.weight ?? 0.5
    const prefix = input.is_return ? "ITL Reverse" : "ITL"
    const base = [
      {
        courier_id: input.is_return ? 9101 : 9001,
        courier_name: `${prefix} Express`,
        rate: input.is_return ? 59 : 49,
        etd: "2-3 days",
        freight_charge: input.is_return ? 59 : 49,
        rto_charges: 35,
        cod_charges: 20,
        charge_weight: weight,
        cod: !input.is_return,
        is_surface: false,
        rating: 4.5,
      },
      {
        courier_id: input.is_return ? 9102 : 9002,
        courier_name: `${prefix} Surface`,
        rate: input.is_return ? 42 : 35,
        etd: "4-6 days",
        freight_charge: input.is_return ? 42 : 35,
        rto_charges: 30,
        cod_charges: 15,
        charge_weight: weight,
        cod: !input.is_return,
        is_surface: true,
        rating: 4.1,
      },
      {
        courier_id: input.is_return ? 9103 : 9003,
        courier_name: `${prefix} Priority`,
        rate: input.is_return ? 89 : 79,
        etd: "1-2 days",
        freight_charge: input.is_return ? 89 : 79,
        rto_charges: 40,
        cod_charges: 25,
        charge_weight: weight,
        cod: !input.is_return,
        is_surface: false,
        rating: 4.8,
      },
    ] as EasyShipCourier[]

    const couriers = base.map((c) => ({
      ...c,
      rate: input.cod && !input.is_return ? Number(c.rate || 0) + Number(c.cod_charges || 0) : c.rate,
    }))
    return {
      couriers,
      rawAvailableCount: couriers.length,
      raw: {
        data: {
          available_courier_companies: couriers,
          pickup_postcode: input.pickup_postcode,
          delivery_postcode: input.delivery_postcode,
          is_return: Boolean(input.is_return),
        },
      },
    }
  }

  async ensurePickup(address: EasyShipPickupAddress) {
    return {
      pickup_location: address.pickup_location,
      pin_code: address.pin_code,
    }
  }

  async createForwardShipment(payload: Record<string, unknown>): Promise<EasyShipCreateResult> {
    const courierId = Number(payload.courier_id) || 9001
    const courier =
      DUMMY_COURIERS.find((c) => c.courier_id === courierId) || DUMMY_COURIERS[0]
    const stamp = Date.now()
    const orderId = `ITL-ORD-${stamp}`
    const shipmentId = `ITL-SHP-${stamp}`
    const awb = `ITL-DUMMY-${stamp}`

    const shipment: DummyShipment = {
      order_id: orderId,
      shipment_id: shipmentId,
      awb,
      courier_id: courier.courier_id,
      courier_name: String(payload.courier_name || courier.courier_name),
      created_at: stamp,
      track_calls: 0,
      status: "awb_assigned",
      activities: [],
    }
    pushActivity(shipment, "awb_assigned", "ITL Dummy Warehouse")
    shipmentsByAwb.set(awb, shipment)
    shipmentsByOrderId.set(orderId, shipment)

    console.log(`[ITL Dummy] Created shipment awb=${awb} order=${orderId}`)

    return {
      order_id: orderId,
      shipment_id: shipmentId,
      awb,
      tracking_url: this.trackingUrlForAwb(awb),
      label_url: this.trackingUrlForAwb(awb),
      raw: { order_id: orderId, shipment_id: shipmentId, awb_code: awb },
    }
  }

  async createReversePickup(payload: Record<string, unknown>): Promise<EasyShipCreateResult> {
    const courierId = Number(payload.courier_id) || 9101
    const stamp = Date.now()
    const orderId = `ITL-RET-${stamp}`
    const shipmentId = `ITL-RSHP-${stamp}`
    const awb = `ITL-REV-DUMMY-${stamp}`

    const shipment: DummyShipment = {
      order_id: orderId,
      shipment_id: shipmentId,
      awb,
      courier_id: courierId,
      courier_name: String(payload.courier_name || "ITL Reverse Express"),
      created_at: stamp,
      track_calls: 0,
      status: "pickup_initiated",
      activities: [],
    }
    pushActivity(shipment, "pickup_initiated", "Customer Address")
    shipmentsByAwb.set(awb, shipment)
    shipmentsByOrderId.set(orderId, shipment)

    console.log(`[ITL Dummy] Created reverse pickup awb=${awb} order=${orderId}`)

    return {
      order_id: orderId,
      shipment_id: shipmentId,
      awb,
      tracking_url: this.trackingUrlForAwb(awb),
      label_url: this.trackingUrlForAwb(awb),
      raw: { order_id: orderId, shipment_id: shipmentId, awb_code: awb, is_return: true },
    }
  }

  async assignAwb(shipmentId: string | number, courierId: number) {
    for (const shipment of shipmentsByAwb.values()) {
      if (String(shipment.shipment_id) === String(shipmentId)) {
        if (!shipment.awb) {
          shipment.awb = `ITL-DUMMY-${Date.now()}`
          shipmentsByAwb.set(shipment.awb, shipment)
        }
        shipment.courier_id = courierId
        return { awb: shipment.awb, raw: { awb_code: shipment.awb } }
      }
    }
    const awb = `ITL-DUMMY-${Date.now()}`
    return { awb, raw: { awb_code: awb, shipment_id: shipmentId } }
  }

  async trackByAwb(awb: string) {
    const shipment = shipmentsByAwb.get(String(awb))
    if (!shipment) {
      throw new Error(`ITL Dummy: unknown AWB ${awb}`)
    }
    if (shipment.cancelled) {
      shipment.status = "cancelled"
      return toTrackPayload(shipment)
    }

    // Webhook-forced exception / terminal statuses stay put
    if (!shipment.locked) {
      shipment.track_calls += 1
      const next = statusFromTrackCalls(shipment.track_calls, shipment.created_at)
      if (next !== shipment.status) {
        shipment.status = next
        pushActivity(
          shipment,
          next,
          next === "delivered" ? "Customer Location" : "In Network"
        )
      }
    } else {
      shipment.track_calls += 1
    }
    console.log(
      `[ITL Dummy] Track awb=${awb} status=${shipment.status} calls=${shipment.track_calls} locked=${Boolean(shipment.locked)}`
    )
    return toTrackPayload(shipment)
  }

  async cancelOrders(orderIds: string[]) {
    const cancelled: string[] = []
    for (const id of orderIds) {
      const shipment = shipmentsByOrderId.get(String(id))
      if (shipment) {
        shipment.cancelled = true
        shipment.status = "cancelled"
        pushActivity(shipment, "cancelled", "ITL Dummy")
        cancelled.push(String(id))
      }
    }
    return { cancelled, status: "ok" }
  }

  trackingUrlForAwb(awb: string) {
    return `https://www.ithinklogistics.com/track-order?awb=${encodeURIComponent(awb)}`
  }
}
