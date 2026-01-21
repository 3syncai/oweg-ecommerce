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
  customer_id: string
  type: string
  status: string
  reason?: string | null
  payment_type: string
  refund_method?: string | null
  bank_account_last4?: string | null
  shiprocket_awb?: string | null
  shiprocket_status?: string | null
  items?: ReturnItem[]
}

const ReturnRequestsPage = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [requests, setRequests] = useState<ReturnRequest[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [bankDetails, setBankDetails] = useState<Record<string, string> | null>(null)
  const [bankDetailsFor, setBankDetailsFor] = useState<string | null>(null)

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

  const runAction = async (id: string, url: string, body?: any) => {
    setActionLoading(id)
    setError("")
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        throw new Error(`Action failed: ${res.status}`)
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

  return (
    <Container className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h1" className="text-2xl font-semibold mb-1">
            Return Requests
          </Heading>
          <Text className="text-ui-fg-subtle">Approve, initiate pickup, and refund</Text>
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
                  const canInitiatePickup = request.status === "approved"
                  const canRefund = request.status === "picked_up"

                  return (
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <Heading level="h2" className="text-lg font-semibold">
                      Order {request.order_id}
                    </Heading>
                    <div className="flex items-center gap-2">
                      <Badge size="small" color="blue">
                        {request.type}
                      </Badge>
                      <Badge size="small" color="green">
                        {request.status}
                      </Badge>
                    </div>
                    {request.reason && (
                      <Text className="text-sm text-ui-fg-subtle">Reason: {request.reason}</Text>
                    )}
                    <Text className="text-sm text-ui-fg-subtle">
                      Payment: {request.payment_type} {request.bank_account_last4 ? `(xxxx${request.bank_account_last4})` : ""}
                    </Text>
                    {request.shiprocket_awb && (
                      <Text className="text-sm text-ui-fg-subtle">
                        AWB: {request.shiprocket_awb} ({request.shiprocket_status || "pending"})
                      </Text>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                    <Button
                      variant="secondary"
                      size="base"
                      disabled={actionLoading === request.id || !canInitiatePickup}
                      onClick={() => {
                        const reason = window.prompt(
                          "Return reason (leave blank to use customer reason):",
                          request.reason || ""
                        )
                        runAction(
                          request.id,
                          `/admin/return-requests/${request.id}/initiate-pickup`,
                          reason ? { reason } : undefined
                        )
                      }}
                    >
                      Initiate Pickup
                    </Button>
                    <Button
                      variant="primary"
                      size="base"
                      disabled={actionLoading === request.id || !canRefund}
                      onClick={() => runAction(request.id, `/admin/return-requests/${request.id}/mark-refunded`)}
                    >
                      Mark Refunded
                    </Button>
                    {request.payment_type === "cod" && (
                      <Button
                        variant="secondary"
                        size="base"
                        onClick={() => loadBankDetails(request.id)}
                      >
                        View Bank Details
                      </Button>
                    )}
                  </div>
                </div>
                  )
                })()}

                {bankDetailsFor === request.id && bankDetails && (
                  <div className="mt-4 border-t border-ui-border-base pt-4">
                    <Text className="text-sm text-ui-fg-subtle">Bank Details</Text>
                    <div className="text-sm mt-2">
                      <div>Account Name: {bankDetails.account_name}</div>
                      <div>Account Number: {bankDetails.account_number}</div>
                      <div>IFSC: {bankDetails.ifsc_code}</div>
                      {bankDetails.bank_name && <div>Bank: {bankDetails.bank_name}</div>}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Return Requests",
})

export default ReturnRequestsPage
