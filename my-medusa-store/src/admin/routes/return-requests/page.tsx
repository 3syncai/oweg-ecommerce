import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { Container, Heading, Text, Button, Badge, toast } from "@medusajs/ui"

type ReturnItem = {
  id: string
  order_item_id: string
  quantity: number
}

type ReturnRequest = {
  id: string
  order_id: string
  order_display_id?: number | null
  customer_id: string | null
  customer_email?: string | null
  customer_name?: string | null
  coins_used?: number | null
  type: string
  status: string
  reason?: string | null
  payment_type: string
  refund_method?: string | null
  bank_account_last4?: string | null
  shiprocket_awb?: string | null
  shiprocket_status?: string | null
  shipping_method?: "easy" | "self" | string | null
  reverse_courier_id?: number | null
  reverse_courier_name?: string | null
  reverse_courier_rate?: number | null
  reverse_tracking_number?: string | null
  reverse_tracking_url?: string | null
  reverse_label_url?: string | null
  reverse_courier_partner?: string | null
  reverse_tracking_saved_at?: string | null
  returned_to_vendor?: boolean
  returned_to_vendor_at?: string | null
  picked_up_at?: string | null
  received_at?: string | null
  metadata?: {
    payout_method?: string
    upi_masked?: string
    bank_account_last4?: string
  } | null
  items?: ReturnItem[]
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

const ReturnRequestsPage = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [requests, setRequests] = useState<ReturnRequest[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [bankDetails, setBankDetails] = useState<Record<string, string> | null>(null)
  const [bankDetailsFor, setBankDetailsFor] = useState<string | null>(null)
  const [refundModal, setRefundModal] = useState<ReturnRequest | null>(null)
  const [refundDetails, setRefundDetails] = useState<Record<string, string> | null>(null)
  const [refundDetailsLoading, setRefundDetailsLoading] = useState(false)

  const loadRequests = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/admin/return-requests", { credentials: "include" })
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status}`)
      }
      const data = await res.json()
      setRequests(data?.return_requests || [])
    } catch (e: any) {
      const msg = e?.message || "Failed to load return requests"
      setError(msg)
      toast.error("Error", { description: msg })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
  }, [])

  const runAction = async (
    id: string,
    url: string,
    body?: any,
    opts?: { redirectOnSuccess?: (data: any) => string | null }
  ) => {
    setActionLoading(id)
    setError("")
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.message || `Action failed: ${res.status}`)
      }
      const redirect =
        (typeof data?.redirect_to === "string" && data.redirect_to) ||
        opts?.redirectOnSuccess?.(data) ||
        null
      if (redirect) {
        toast.success("Approved", { description: "Opening return booking…" })
        window.location.href = redirect
        return
      }
      toast.success("Success", { description: "Action completed" })
      await loadRequests()
    } catch (e: any) {
      const msg = e?.message || "Action failed"
      setError(msg)
      toast.error("Error", { description: msg })
    } finally {
      setActionLoading(null)
    }
  }

  const loadBankDetails = async (id: string) => {
    setBankDetails(null)
    setBankDetailsFor(id)
    try {
      const res = await fetch(`/admin/return-requests/${id}`, { credentials: "include" })
      if (!res.ok) {
        throw new Error(`Failed to load details: ${res.status}`)
      }
      const data = await res.json()
      setBankDetails(data?.return_request?.bank_details || null)
    } catch (e: any) { 
      const msg = e?.message || "Failed to load bank details"
      toast.error("Error", { description: msg })
    }
  }

  const openRefundModal = async (request: ReturnRequest) => {
    setRefundModal(request)
    setRefundDetails(null)
    setRefundDetailsLoading(true)
    try {
      const res = await fetch(`/admin/return-requests/${request.id}`, { credentials: "include" })
      if (!res.ok) throw new Error(`Failed to load refund details: ${res.status}`)
      const data = await res.json()
      setRefundDetails(data?.return_request?.bank_details || null)
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed to load refund details" })
      setRefundModal(null)
    } finally {
      setRefundDetailsLoading(false)
    }
  }

  const confirmMarkRefunded = async () => {
    if (!refundModal) return
    await runAction(refundModal.id, `/admin/return-requests/${refundModal.id}/mark-refunded`)
    setRefundModal(null)
    setRefundDetails(null)
  }

  return (
    <Container className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h1" className="text-2xl font-semibold mb-1">
            Return Requests
          </Heading>
          <Text className="text-ui-fg-subtle">
            Approve returns — Easy Ship returns open booking automatically
          </Text>
        </div>
        <Button variant="secondary" onClick={loadRequests} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4">
          <Text className="text-sm font-medium">{error}</Text>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center">
          <Text className="text-ui-fg-subtle">Loading return requests...</Text>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="bg-ui-bg-subtle border border-ui-border-base rounded-xl p-8 text-center">
              <Heading level="h3" className="text-lg mb-2">
                No return requests
              </Heading>
              <Text className="text-ui-fg-subtle">New requests will appear here</Text>
            </div>
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className="bg-ui-bg-base border border-ui-border-base rounded-xl p-5"
              >
                {(() => {
                  const canApprove = request.status === "pending_approval"
                  const canReject = request.status === "pending_approval"
                  const isEasyReturn = request.shipping_method === "easy"
                  const canBookReturnPickup =
                    isEasyReturn && request.status === "approved" && !request.shiprocket_awb
                  const canRefund =
                    request.status === "picked_up" || request.status === "received"
                  const returnedToVendor =
                    Boolean(request.returned_to_vendor) || request.status === "received"

                  return (
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <Heading level="h2" className="text-lg font-semibold">
                      {request.order_display_id ? `Order #${request.order_display_id}` : `Order ${request.order_id}`}
                    </Heading>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge size="small" color={request.type === "replacement" ? "blue" : "orange"}>
                        {request.type}
                      </Badge>
                      <Badge size="small" color="green">
                        {request.status.replace(/_/g, " ")}
                      </Badge>
                      {request.shipping_method === "easy" ? (
                        <Badge size="small" color="purple">
                          Easy Ship return
                        </Badge>
                      ) : request.shipping_method === "self" ? (
                        <Badge size="small" color="grey">
                          Self Ship return
                        </Badge>
                      ) : null}
                      {returnedToVendor ? (
                        <Badge size="small" color="green">
                          Returned to vendor
                        </Badge>
                      ) : null}
                    </div>
                    {returnedToVendor ? (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                        <Text className="text-sm font-medium text-emerald-800">
                          Order returned to the vendor
                        </Text>
                        <Text className="text-sm text-ui-fg-subtle">
                          Parcel is back with the seller
                          {request.returned_to_vendor_at || request.received_at
                            ? ` · ${new Date(
                                String(request.returned_to_vendor_at || request.received_at)
                              ).toLocaleString("en-IN")}`
                            : ""}
                        </Text>
                      </div>
                    ) : null}
                    {request.reason && (
                      <Text className="text-sm text-ui-fg-subtle">Reason: {request.reason}</Text>
                    )}
                    <Text className="text-sm text-ui-fg-subtle">
                      Customer: {request.customer_name || "Unknown"} ({request.customer_email || "no-email"}) • ID:{" "}
                      {request.customer_id || "unknown"}
                    </Text>
                    <Text className="text-sm text-ui-fg-subtle">
                      Coins used: {Math.round(typeof request.coins_used === "number" ? request.coins_used : 0)}
                    </Text>
                    <Text className="text-sm text-ui-fg-subtle">
                      Payment: {request.payment_type}
                      {request.refund_method ? ` • Refund via ${request.refund_method}` : ""}
                      {request.bank_account_last4 ? ` (xxxx${request.bank_account_last4})` : ""}
                      {request.metadata?.upi_masked ? ` • ${request.metadata.upi_masked}` : ""}
                    </Text>
                    {request.shipping_method === "easy" ? (
                      <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle/50 px-3 py-2 space-y-1">
                        <Text className="text-sm font-medium">Easy Ship reverse logistics</Text>
                        {request.reverse_courier_name ? (
                          <Text className="text-sm text-ui-fg-subtle">
                            Service: {request.reverse_courier_name}
                            {request.reverse_courier_rate != null
                              ? ` · ${formatCurrency(Number(request.reverse_courier_rate))}`
                              : ""}
                          </Text>
                        ) : (
                          <Text className="text-sm text-amber-700">
                            Approve this return to book reverse pickup
                          </Text>
                        )}
                        {request.shiprocket_awb && (
                          <Text className="text-sm text-ui-fg-subtle">
                            AWB: {request.shiprocket_awb} ({request.shiprocket_status || "pending"})
                          </Text>
                        )}
                      </div>
                    ) : null}
                    {request.shipping_method === "self" ? (
                      <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle/50 px-3 py-2 space-y-1">
                        <Text className="text-sm font-medium">Self ship reverse tracking</Text>
                        {request.reverse_courier_partner ? (
                          <Text className="text-sm text-ui-fg-subtle">
                            Courier: {request.reverse_courier_partner}
                          </Text>
                        ) : null}
                        {request.reverse_tracking_number || request.shiprocket_awb ? (
                          <Text className="text-sm text-ui-fg-subtle">
                            Tracking ID: {request.reverse_tracking_number || request.shiprocket_awb}
                          </Text>
                        ) : (
                          <Text className="text-sm text-amber-700">
                            Vendor has not added return tracking yet
                          </Text>
                        )}
                        {request.reverse_tracking_url ? (
                          <Text className="text-sm text-ui-fg-subtle">
                            Tracking URL:{" "}
                            <a
                              href={request.reverse_tracking_url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              Open link
                            </a>
                          </Text>
                        ) : null}
                        {request.reverse_label_url ? (
                          <Text className="text-sm text-ui-fg-subtle">
                            Label:{" "}
                            <a
                              href={request.reverse_label_url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              Open label
                            </a>
                          </Text>
                        ) : null}
                      </div>
                    ) : null}
                    {!request.shipping_method && request.shiprocket_awb ? (
                      <Text className="text-sm text-ui-fg-subtle">
                        AWB: {request.shiprocket_awb} ({request.shiprocket_status || "pending"})
                      </Text>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="base"
                      onClick={() => {
                        window.location.href = `/app/orders/${request.order_id}`
                      }}
                    >
                      View Order
                    </Button>
                    <Button
                      variant="secondary"
                      size="base"
                      disabled={actionLoading === request.id || !canApprove}
                      onClick={() => runAction(request.id, `/admin/return-requests/${request.id}/approve`)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      size="base"
                      disabled={actionLoading === request.id || !canReject}
                      onClick={() => {
                        const reason = prompt("Rejection reason")
                        if (reason) {
                          runAction(request.id, `/admin/return-requests/${request.id}/reject`, { reason })
                        }
                      }}
                    >
                      Reject
                    </Button>
                    {canBookReturnPickup ? (
                      <Button
                        variant="primary"
                        size="base"
                        onClick={() => {
                          window.location.href = `/app/return-packet-booking?return_id=${request.id}`
                        }}
                      >
                        Book Return Pickup
                      </Button>
                    ) : null}
                    <Button
                      variant="primary"
                      size="base"
                      disabled={actionLoading === request.id || !canRefund}
                      onClick={() => void openRefundModal(request)}
                    >
                      Mark Refunded
                    </Button>
                    {(request.refund_method === "bank" ||
                      request.refund_method === "upi" ||
                      request.payment_type === "cod" ||
                      request.bank_account_last4 ||
                      request.metadata?.upi_masked) && (
                      <Button
                        variant="secondary"
                        size="base"
                        onClick={() => loadBankDetails(request.id)}
                      >
                        View Refund Details
                      </Button>
                    )}
                  </div>
                </div>
                  )
                })()}

                {bankDetailsFor === request.id && bankDetails && (
                  <div className="mt-4 border-t border-ui-border-base pt-4">
                    <Text className="text-sm text-ui-fg-subtle">
                      {bankDetails.method === "upi" ? "UPI Details" : "Bank Details"}
                    </Text>
                    <div className="text-sm mt-2">
                      {bankDetails.method === "upi" || bankDetails.upi_id ? (
                        <div>UPI ID: {bankDetails.upi_id}</div>
                      ) : (
                        <>
                          <div>Account Name: {bankDetails.account_name}</div>
                          <div>Account Number: {bankDetails.account_number}</div>
                          <div>IFSC: {bankDetails.ifsc_code}</div>
                          {bankDetails.bank_name && <div>Bank: {bankDetails.bank_name}</div>}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xl">
            <Heading level="h2" className="text-lg">
              Mark as refunded
              {refundModal.order_display_id ? ` · Order #${refundModal.order_display_id}` : ""}
            </Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Refund via {refundModal.refund_method || "original payment method"}
            </Text>

            <div className="mt-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle/50 p-4">
              <Text weight="plus" className="mb-2">
                Customer refund details
              </Text>
              {refundDetailsLoading ? (
                <Text size="small" className="text-ui-fg-muted">
                  Loading…
                </Text>
              ) : refundDetails ? (
                <div className="space-y-1 text-sm">
                  {refundDetails.method === "upi" || refundDetails.upi_id ? (
                    <>
                      <div>
                        <span className="text-ui-fg-subtle">UPI ID: </span>
                        <span className="font-medium">{refundDetails.upi_id}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {refundDetails.account_name ? (
                        <div>
                          <span className="text-ui-fg-subtle">Account name: </span>
                          {refundDetails.account_name}
                        </div>
                      ) : null}
                      {refundDetails.account_number ? (
                        <div>
                          <span className="text-ui-fg-subtle">Account number: </span>
                          <span className="font-medium">{refundDetails.account_number}</span>
                        </div>
                      ) : null}
                      {refundDetails.ifsc_code ? (
                        <div>
                          <span className="text-ui-fg-subtle">IFSC: </span>
                          {refundDetails.ifsc_code}
                        </div>
                      ) : null}
                      {refundDetails.bank_name ? (
                        <div>
                          <span className="text-ui-fg-subtle">Bank: </span>
                          {refundDetails.bank_name}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <Text size="small" className="text-ui-fg-muted">
                  No UPI or bank details saved for this return. Refund will go via original
                  payment method.
                </Text>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setRefundModal(null)
                  setRefundDetails(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={actionLoading === refundModal.id || refundDetailsLoading}
                isLoading={actionLoading === refundModal.id}
                onClick={() => void confirmMarkRefunded()}
              >
                Confirm refund
              </Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Returns",
})

export default ReturnRequestsPage
