import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Heading, Text } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

type OrderRecord = {
  id?: string
  status?: string
  metadata?: Record<string, unknown> | null
}

type CancelPayoutDetails = {
  method?: string | null
  upi_id?: string
  account_name?: string
  account_number?: string
  ifsc_code?: string
  bank_name?: string
}

type CancelPayoutResponse = {
  method: string | null
  upi_masked: string | null
  bank_last4: string | null
  details: CancelPayoutDetails | null
}

function extractOrder(data: unknown): OrderRecord | null {
  if (!data || typeof data !== "object") return null
  const root = data as Record<string, unknown>
  if (root.order && typeof root.order === "object") return root.order as OrderRecord
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>
    if (nested.order && typeof nested.order === "object") return nested.order as OrderRecord
  }
  return root as OrderRecord
}

function getOrderIdFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  const index = parts.indexOf("orders")
  if (index === -1) return null
  return parts[index + 1] || null
}

function formatDate(value: string | null) {
  if (!value) return "Not available"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

const InfoRow = ({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) => (
  <div className="flex items-start justify-between gap-4 border-b border-ui-border-base py-3 last:border-b-0">
    <Text size="small" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="small" weight="plus" className="max-w-[60%] text-right">
      {value}
    </Text>
  </div>
)

const OrderCancellationSummaryWidget = () => {
  const [order, setOrder] = useState<OrderRecord | null>(null)
  const [cancelPayout, setCancelPayout] = useState<CancelPayoutResponse | null>(null)
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
        const response = await fetch(`/admin/orders/${orderId}`, {
          credentials: "include",
        })
        if (!response.ok) return
        const data = await response.json()
        const nextOrder = extractOrder(data)
        setOrder(nextOrder)

        const meta = (nextOrder?.metadata || {}) as Record<string, unknown>
        const hasPayout =
          typeof meta.cancel_refund_payout_encrypted === "string" ||
          typeof meta.cancel_refund_method === "string"
        if (!hasPayout) {
          setCancelPayout(null)
          return
        }

        const payoutRes = await fetch(`/admin/orders/${orderId}/cancel-payout`, {
          credentials: "include",
        })
        if (!payoutRes.ok) return
        const payoutData = await payoutRes.json()
        setCancelPayout(payoutData?.cancel_payout || null)
      } catch {
        // Keep order page stable if widget fetch fails.
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [orderId])

  const metadata = (order?.metadata || {}) as Record<string, unknown>
  const status = (order?.status || "").toLowerCase()
  const isCanceled = status === "canceled" || status === "cancelled"
  const reason =
    typeof metadata.cancellation_reason === "string" ? metadata.cancellation_reason : null
  const requestedAt =
    typeof metadata.cancellation_requested_at === "string"
      ? metadata.cancellation_requested_at
      : null
  const requestedBy =
    typeof metadata.cancellation_requested_by === "string"
      ? metadata.cancellation_requested_by
      : null
  const shiprocketStatus =
    typeof metadata.shiprocket_status === "string" ? metadata.shiprocket_status : null

  const payoutMethod =
    cancelPayout?.method ||
    (typeof metadata.cancel_refund_method === "string"
      ? metadata.cancel_refund_method
      : null)
  const hasCancelContext = isCanceled || Boolean(reason) || Boolean(payoutMethod)

  if (!loading && !hasCancelContext) {
    return null
  }

  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base px-6 py-5">
      <div className="flex items-center justify-between gap-3 pb-4">
        <div>
          <Heading level="h3" className="text-base">
            Cancellation Details
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Customer cancellation request submitted from the storefront.
          </Text>
        </div>
        <Badge size="small" color="red" className="uppercase">
          Cancelled
        </Badge>
      </div>

      {loading ? (
        <Text size="small" className="text-ui-fg-subtle">
          Loading cancellation details...
        </Text>
      ) : (
        <div className="grid gap-0">
          <InfoRow label="Reason" value={reason || "Not recorded"} />
          <InfoRow label="Requested at" value={formatDate(requestedAt)} />
          <InfoRow label="Customer ID" value={requestedBy || "Not recorded"} />
          {shiprocketStatus ? (
            <InfoRow label="Shiprocket status" value={shiprocketStatus} />
          ) : null}
          {payoutMethod ? (
            <>
              <InfoRow
                label="Refund payout method"
                value={
                  payoutMethod === "upi"
                    ? "UPI"
                    : payoutMethod === "bank"
                      ? "Bank transfer"
                      : payoutMethod
                }
              />
              {payoutMethod === "upi" ? (
                <InfoRow
                  label="UPI ID"
                  value={
                    cancelPayout?.details?.upi_id ||
                    cancelPayout?.upi_masked ||
                    (typeof metadata.cancel_upi_masked === "string"
                      ? metadata.cancel_upi_masked
                      : "Unavailable")
                  }
                />
              ) : null}
              {payoutMethod === "bank" ? (
                <>
                  <InfoRow
                    label="Account name"
                    value={cancelPayout?.details?.account_name || "Unavailable"}
                  />
                  <InfoRow
                    label="Account number"
                    value={
                      cancelPayout?.details?.account_number ||
                      (cancelPayout?.bank_last4
                        ? `****${cancelPayout.bank_last4}`
                        : typeof metadata.cancel_bank_last4 === "string"
                          ? `****${metadata.cancel_bank_last4}`
                          : "Unavailable")
                    }
                  />
                  <InfoRow
                    label="IFSC"
                    value={cancelPayout?.details?.ifsc_code || "Unavailable"}
                  />
                  {cancelPayout?.details?.bank_name ? (
                    <InfoRow label="Bank name" value={cancelPayout.details.bank_name} />
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderCancellationSummaryWidget
