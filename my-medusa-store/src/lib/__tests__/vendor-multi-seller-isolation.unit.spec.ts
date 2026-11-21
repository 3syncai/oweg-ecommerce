import {
  deriveFulfillmentStatus,
  deriveVendorStage,
  ensureVendorDisplayIds,
  formatVendorOrder,
  resolveVendorDisplayId,
  sumVendorLineTotal,
} from "../vendor-order-workflow"
import { trackSelfShipment } from "../../services/self-shipping-tracking"

const VENDOR_A = "01VENDOR_AAAA"
const VENDOR_B = "01VENDOR_BBBB"

function multiVendorOrder(overrides: Record<string, any> = {}) {
  return {
    id: "order_multi_1",
    status: "pending",
    created_at: "2026-11-01T00:00:00.000Z",
    items: [
      {
        id: "item_a",
        title: "Vendor A SKU",
        quantity: 1,
        unit_price: 50000,
        product_id: "prod_a",
        variant: { product_id: "prod_a" },
      },
      {
        id: "item_b",
        title: "Vendor B SKU",
        quantity: 1,
        unit_price: 120000,
        product_id: "prod_b",
        variant: { product_id: "prod_b" },
      },
    ],
    fulfillments: [
      {
        id: "ful_a",
        shipped_at: "2026-11-02T00:00:00.000Z",
        delivered_at: "2026-11-03T00:00:00.000Z",
      },
      {
        id: "ful_b",
        shipped_at: "2026-11-02T12:00:00.000Z",
        delivered_at: null,
      },
    ],
    metadata: {
      expected_shipping_price: 50,
      shiprocket_status: "delivered",
      vendor_order_workflows: {
        [VENDOR_A]: {
          stage: "delivered",
          shipping_method: "easy",
          medusa_fulfillment_id: "ful_a",
          shiprocket_status: "delivered",
          shiprocket_delivered_at: "2026-11-03T00:00:00.000Z",
          shiprocket_awb: "AWB_A",
        },
        [VENDOR_B]: {
          stage: "in_transit",
          shipping_method: "self",
          medusa_fulfillment_id: "ful_b",
          shiprocket_status: "in_transit",
          self_awb: "AWB_B",
          self_tracking_source: "manual",
        },
      },
    },
    ...overrides,
  }
}

describe("multi-vendor stage isolation", () => {
  it("does not mark Vendor B delivered when only Vendor A fulfillment is delivered", () => {
    const order = multiVendorOrder()
    const wfA = order.metadata.vendor_order_workflows[VENDOR_A]
    const wfB = order.metadata.vendor_order_workflows[VENDOR_B]

    expect(deriveFulfillmentStatus(order as any, wfA)).toBe("delivered")
    expect(deriveFulfillmentStatus(order as any, wfB)).toBe("shipped")

    expect(deriveVendorStage(order as any, wfA)).toBe("delivered")
    expect(deriveVendorStage(order as any, wfB)).toBe("in_transit")
  })

  it("ignores root shiprocket_status for multi-vendor sibling stage", () => {
    const order = multiVendorOrder({
      metadata: {
        shiprocket_status: "delivered",
        expected_shipping_price: 50,
        vendor_order_workflows: {
          [VENDOR_A]: {
            stage: "delivered",
            medusa_fulfillment_id: "ful_a",
            shiprocket_status: "delivered",
          },
          [VENDOR_B]: {
            stage: "to_pack",
            medusa_fulfillment_id: "ful_b",
            // no shiprocket_status — must NOT inherit root "delivered"
          },
        },
      },
      fulfillments: [
        { id: "ful_a", delivered_at: "2026-11-03T00:00:00.000Z" },
        { id: "ful_b", delivered_at: null },
      ],
    })

    const wfB = order.metadata.vendor_order_workflows[VENDOR_B]
    expect(deriveVendorStage(order as any, wfB)).toBe("to_pack")
  })

  it("scrubs sibling workflows from formatVendorOrder metadata", () => {
    const order = multiVendorOrder()
    const formatted = formatVendorOrder(order as any, VENDOR_B, ["prod_b"])
    const workflows = formatted.metadata?.vendor_order_workflows || {}

    expect(Object.keys(workflows)).toEqual([VENDOR_B])
    expect(workflows[VENDOR_A]).toBeUndefined()
    expect(formatted.vendor_stage).toBe("in_transit")
    expect(formatted.items.map((i: any) => i.product_id)).toEqual(["prod_b"])
  })

  it("assigns customer shipping only to lexicographically first workflow vendor", () => {
    const order = multiVendorOrder()
    const rates = {
      commission_rate: 10,
      tcs_rate: 1,
      tds_rate: 1,
      platform_fee_rate: 5,
      partner_rate: 0,
      service_gst_rate: 18,
    }

    const formattedA = formatVendorOrder(order as any, VENDOR_A, ["prod_a"], rates)
    const formattedB = formatVendorOrder(order as any, VENDOR_B, ["prod_b"], rates)

    // VENDOR_A sorts before VENDOR_B
    expect(formattedA.settlement?.customer_shipping_total).toBe(50)
    expect(formattedB.settlement?.customer_shipping_total).toBe(0)
  })

  it("sums only this vendor's line totals", () => {
    const order = multiVendorOrder()
    expect(sumVendorLineTotal(order as any, ["prod_a"])).toBe(50000)
    expect(sumVendorLineTotal(order as any, ["prod_b"])).toBe(120000)
    expect(sumVendorLineTotal(order as any, ["prod_a", "prod_b"])).toBe(170000)
  })
})

describe("vendor-facing order ids", () => {
  it("assigns distinct slice ids for multi-vendor carts", () => {
    const { metadata, changed } = ensureVendorDisplayIds(
      { vendor_order_workflows: { [VENDOR_B]: { stage: "to_accept" }, [VENDOR_A]: { stage: "to_accept" } } },
      [VENDOR_A, VENDOR_B],
      1256
    )
    expect(changed).toBe(true)
    expect(metadata.vendor_order_workflows[VENDOR_A].vendor_display_id).toBe("1256-1")
    expect(metadata.vendor_order_workflows[VENDOR_B].vendor_display_id).toBe("1256-2")

    const order = multiVendorOrder({
      display_id: 1256,
      metadata,
    })
    expect(resolveVendorDisplayId(order as any, VENDOR_A)).toBe("1256-1")
    expect(resolveVendorDisplayId(order as any, VENDOR_B)).toBe("1256-2")
    expect(formatVendorOrder(order as any, VENDOR_A, ["prod_a"]).display_id).toBe("1256-1")
    expect(formatVendorOrder(order as any, VENDOR_B, ["prod_b"]).display_id).toBe("1256-2")
  })
})

describe("self-ship manual tracking", () => {
  it("does not poll Shiprocket when trackingSource is manual", async () => {
    const result: any = await trackSelfShipment({
      courierPartnerName: "Delhivery",
      awb: "AWB_MANUAL_1",
      trackingSource: "manual",
    })

    expect(result.source).toBe("manual")
    expect(result.status).not.toBe("delivered")
    expect(String(result.status || "")).toMatch(/in_transit|not_shipped|manual/i)
  })
})
