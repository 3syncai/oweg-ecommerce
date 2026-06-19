import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Heading, Text } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

type ReturnRequest = {
  id: string
  order_id: string
  type: string
  status: string
  reason?: string | null
  notes?: string | null
  payment_type?: string | null
  bank_account_last4?: string | null
  shiprocket_awb?: string | null
  shiprocket_status?: string | null
  created_at?: string | null
  items?: Array<{ order_item_id: string; quantity: number }>
}

function getOrderIdFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  const index = parts.indexOf("orders")
  if (index === -1) return null
  return parts[index + 1] || null
}

function formatDate(value?: string | null) {
  if (!value) return "Not available"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
}

function statusColor(status: string): "orange" | "green" | "red" | "blue" | "grey" {
  const value = status.toLowerCase()
  if (value === "pending_approval") return "orange"
  if (["approved", "pickup_initiated", "picked_up", "received", "refunded", "replaced"].includes(value)) {
    return "green"
  }
  if (value === "rejected") return "red"
  return "blue"
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ")
}

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 border-b border-ui-border-base py-3 last:border-b-0">
    <Text size="small" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="small" weight="plus" className="max-w-[60%] text-right">
      {value}
    </Text>
  </div>
)

const OrderReturnSummaryWidget = () => {
  const [request, setRequest] = useState<ReturnRequest | null>(null)
  const [loading, setLoading] = useState(false)

  const orderId = useMemo(() => {
    if (typeof window === "undefined") return null
    return getOrderIdFromPath(window.location.pathname)
  }, [])

  useEffect(() => {
    if (!orderId) return
    const load = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/admin/return-requests/by-order/${orderId}`, {
          credentials: "include",
        })
        if (!response.ok) return
        const data = await response.json()
        setRequest(data?.return_request || null)
      } catch {
        // Keep order page stable if widget fetch fails.
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [orderId])

  if (!loading && !request) {
    return null
  }

  const typeLabel = request?.type === "replacement" ? "Replacement" : "Return"

  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base px-6 py-5">
      <div className="flex items-start justify-between gap-3 pb-4">
        <div>
          <Heading level="h3" className="text-base">
            Return / Replacement
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Customer submitted a {typeLabel.toLowerCase()} request from the storefront.
          </Text>
        </div>
        {request ? (
          <Badge size="small" color={statusColor(request.status)} className="uppercase">
            {statusLabel(request.status)}
          </Badge>
        ) : null}
      </div>

      {loading ? (
        <Text size="small" className="text-ui-fg-subtle">
          Loading return details...
        </Text>
      ) : request ? (
        <>
          <div className="grid gap-0">
            <InfoRow label="Request type" value={typeLabel} />
            <InfoRow label="Reason" value={request.reason || "Not recorded"} />
            <InfoRow label="Requested at" value={formatDate(request.created_at)} />
            <InfoRow label="Payment type" value={request.payment_type || "online"} />
            {request.bank_account_last4 ? (
              <InfoRow label="Refund account" value={`xxxx${request.bank_account_last4}`} />
            ) : null}
            {request.shiprocket_awb ? (
              <InfoRow
                label="Return AWB"
                value={`${request.shiprocket_awb}${request.shiprocket_status ? ` (${request.shiprocket_status})` : ""}`}
              />
            ) : null}
            {request.items?.length ? (
              <InfoRow label="Items" value={`${request.items.length} line item(s)`} />
            ) : null}
            {request.notes ? <InfoRow label="Customer notes" value={request.notes} /> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="small"
              variant="secondary"
              onClick={() => {
                window.location.href = "/app/return-requests"
              }}
            >
              Open Return Requests
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderReturnSummaryWidget
