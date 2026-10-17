import { normalizeDeliveryVendorScope, resolvePayoutHoldDays } from "../vendor-earnings"
import { resolveVendorIdFromShipmentMetadata } from "../vendor-order-workflow"

describe("normalizeDeliveryVendorScope", () => {
  it("returns empty when no vendor scope is provided", () => {
    expect(normalizeDeliveryVendorScope()).toEqual([])
    expect(normalizeDeliveryVendorScope({})).toEqual([])
    expect(normalizeDeliveryVendorScope({ vendorId: null, vendorIds: [] })).toEqual([])
  })

  it("dedupes vendorId and vendorIds", () => {
    expect(
      normalizeDeliveryVendorScope({
        vendorId: " vendor_a ",
        vendorIds: ["vendor_a", "vendor_b", "", "vendor_b"],
      })
    ).toEqual(["vendor_a", "vendor_b"])
  })
})

describe("resolvePayoutHoldDays", () => {
  it("uses the longer of the selected return and replacement windows", () => {
    expect(resolvePayoutHoldDays(4, 10)).toBe(10)
    expect(resolvePayoutHoldDays(14, 7)).toBe(14)
  })

  it("defaults to seven days when neither policy duration is set", () => {
    expect(resolvePayoutHoldDays(null, undefined)).toBe(7)
    expect(resolvePayoutHoldDays("", "")).toBe(7)
  })

  it("uses a valid configured duration when the other value is invalid", () => {
    expect(resolvePayoutHoldDays("four", 5)).toBe(5)
    expect(resolvePayoutHoldDays(366, 3)).toBe(3)
  })
})

describe("resolveVendorIdFromShipmentMetadata", () => {
  it("matches AWB on a vendor workflow", () => {
    const vendorId = resolveVendorIdFromShipmentMetadata(
      {
        vendor_order_workflows: {
          vend_1: { shiprocket_awb: "AWB111" },
          vend_2: { shiprocket_awb: "AWB222" },
        },
      },
      { awb: "AWB222" }
    )
    expect(vendorId).toBe("vend_2")
  })

  it("falls back to the only vendor when root AWB matches", () => {
    const vendorId = resolveVendorIdFromShipmentMetadata(
      {
        shiprocket_awb: "AWB999",
        vendor_order_workflows: {
          vend_only: { stage: "in_transit" },
        },
      },
      { awb: "AWB999" }
    )
    expect(vendorId).toBe("vend_only")
  })

  it("returns null for multi-vendor orders without a shipment match", () => {
    const vendorId = resolveVendorIdFromShipmentMetadata(
      {
        vendor_order_workflows: {
          vend_1: { shiprocket_awb: "A1" },
          vend_2: { shiprocket_awb: "A2" },
        },
      },
      { awb: "UNKNOWN" }
    )
    expect(vendorId).toBeNull()
  })
})
