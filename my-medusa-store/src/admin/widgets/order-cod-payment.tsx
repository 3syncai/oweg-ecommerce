import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Heading, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useState } from "react"

type OrderRecord = {
  id?: string
  payment_status?: string
  metadata?: Record<string, unknown> | null
  summary?: {
    paid_total?: number
    current_order_total?: number
    accounting_total?: number
  } | null
  fulfillments?: Array<{ delivered_at?: string | null }> | null
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

function formatRupees(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value)
}

const OrderCodPaymentWidget = () => {
  const [order, setOrder] = useState<OrderRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const orderId = useMemo(() => {
    if (typeof window === "undefined") return null
    return getOrderIdFromPath(window.location.pathname)
  }, [])

  const loadOrder = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    try {
      const response = await fetch(
        `/admin/orders/${orderId}?fields=id,payment_status,metadata,summary,fulfillments.delivered_at`,
        { credentials: "include" }
      )
      if (!response.ok) return
      const data = await response.json()
      setOrder(extractOrder(data))
    } catch {
      // keep order page stable if widget fetch fails
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void loadOrder()
  }, [loadOrder])

  const metadata = (order?.metadata || {}) as Record<string, unknown>
  const paymentMethod =
    typeof metadata.payment_method === "string" ? metadata.payment_method.toLowerCase() : ""
  const codPaymentStatus =
    typeof metadata.cod_payment_status === "string"
      ? metadata.cod_payment_status.toLowerCase()
      : ""

  const isCod = paymentMethod === "cod"
  const isDelivered = Boolean(
    order?.fulfillments?.some((fulfillment) => Boolean(fulfillment?.delivered_at))
  )

  const orderTotal = Number(
    order?.summary?.current_order_total ??
      order?.summary?.accounting_total ??
      0
  )
  const paidTotal = Number(order?.summary?.paid_total ?? 0)
  const isPaid =
    codPaymentStatus === "captured" ||
    order?.payment_status === "captured" ||
    (orderTotal > 0 && paidTotal >= orderTotal)

  const handleMarkAsPaid = async () => {
    if (!orderId) return
    setSubmitting(true)
    try {
      const response = await fetch(`/admin/orders/${orderId}/mark-cod-paid`, {
        method: "POST",
        credentials: "include",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          typeof payload.message === "string"
            ? payload.message
            : "Unable to mark this order as paid."
        )
      }
      toast.success("COD payment marked as captured.")
      await loadOrder()
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to mark as paid.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!isCod) {
    return null
  }

  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base px-6 py-5">
      <div className="flex items-center justify-between gap-3 pb-4">
        <div>
          <Heading level="h3" className="text-base">
            Cash on Delivery
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Record payment after the customer pays on delivery.
          </Text>
        </div>
        <Badge
          size="small"
          color={isPaid ? "green" : isDelivered ? "orange" : "grey"}
          className="uppercase"
        >
          {isPaid ? "Paid" : isDelivered ? "Awaiting payment" : "Not delivered"}
        </Badge>
      </div>

      {loading ? (
        <Text size="small" className="text-ui-fg-subtle">
          Loading COD payment status...
        </Text>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <Text size="small" className="text-ui-fg-subtle">
                Order total
              </Text>
              <Text size="small" weight="plus">
                {orderTotal > 0 ? formatRupees(orderTotal) : "—"}
              </Text>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Text size="small" className="text-ui-fg-subtle">
                Paid total
              </Text>
              <Text size="small" weight="plus">
                {formatRupees(paidTotal)}
              </Text>
            </div>
          </div>

          {!isPaid && isDelivered ? (
            <Button
              variant="primary"
              size="small"
              isLoading={submitting}
              onClick={handleMarkAsPaid}
            >
              Mark as paid
            </Button>
          ) : null}

          {!isPaid && !isDelivered ? (
            <Text size="small" className="text-ui-fg-subtle">
              Payment can be recorded once the order is delivered.
            </Text>
          ) : null}

          {isPaid ? (
            <Text size="small" className="text-ui-fg-subtle">
              Payment captured for this COD order.
            </Text>
          ) : null}
        </div>
      )}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderCodPaymentWidget
