import {
  applyAdminCancellationMetadata,
  readCancellationInfo,
} from "../order-cancel/metadata"

describe("order cancel metadata hygiene", () => {
  it("does not treat customer reason as vendor message", () => {
    const info = readCancellationInfo({
      status: "canceled",
      metadata: {
        customer_cancel_reason: "Changed my mind",
        cancellation_reason: "Changed my mind",
        cancellation_note: "Changed my mind",
        cancellation_source: "customer",
        cancelled_by_admin: false,
      },
    })
    expect(info.source).toBe("customer")
    expect(info.customer_reason).toBe("Changed my mind")
    expect(info.vendor_message).toBeNull()
    expect(info.cancelled_by_label).toBe("Customer cancelled this order")
  })

  it("PUT message attach preserves customer cancellation_source", () => {
    const next = applyAdminCancellationMetadata(
      {
        customer_cancel_reason: "Changed my mind",
        cancellation_source: "customer",
        cancelled_by_admin: false,
        cancelled_by: "customer",
        cancellation_requested_at: "2026-01-01T00:00:00.000Z",
      },
      {
        customerReason: "Changed my mind",
        vendorMessage: "Sorry — restocked",
        adminId: "user_admin",
        keepCancelledAt: true,
        forceAdminSource: false,
      }
    )
    expect(next.cancellation_source).toBe("customer")
    expect(next.cancelled_by_admin).toBe(false)
    expect(next.cancelled_by).toBe("customer")
    expect(next.vendor_cancel_message).toBe("Sorry — restocked")
    expect(next.cancellation_note).toBe("Sorry — restocked")
    expect(next.customer_cancel_reason).toBe("Changed my mind")
  })

  it("admin cancel forces admin source", () => {
    const next = applyAdminCancellationMetadata(
      {},
      {
        customerReason: "Out of stock",
        vendorMessage: "Do not ship",
        adminId: "user_admin",
        forceAdminSource: true,
      }
    )
    expect(next.cancellation_source).toBe("admin")
    expect(next.cancelled_by_admin).toBe(true)
    expect(next.cancelled_by).toBe("admin")
  })
})
