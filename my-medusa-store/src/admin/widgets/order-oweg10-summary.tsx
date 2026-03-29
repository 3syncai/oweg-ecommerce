import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Heading, Text } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

type OrderRecord = {
  id?: string
  metadata?: Record<string, unknown> | null
}

function extractOrder(data: unknown): OrderRecord | null {
  if (!data || typeof data !== "object") {
    return null
  }

  const root = data as Record<string, unknown>

  if (root.order && typeof root.order === "object") {
    return root.order as OrderRecord
  }

  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>
    if (nested.order && typeof nested.order === "object") {
      return nested.order as OrderRecord
    }
  }

  return root as OrderRecord
}

function getOrderIdFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  const index = parts.indexOf("orders")
  if (index === -1) {
    return null
  }

  return parts[index + 1] || null
}

function formatRupees(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not available"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

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
}) => {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ui-border-base py-3 last:border-b-0">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Text size="small" weight="plus" className="text-right">
        {value}
      </Text>
    </div>
  )
}

const OrderOweg10SummaryWidget = () => {
  const [order, setOrder] = useState<OrderRecord | null>(null)
  const [loading, setLoading] = useState(false)

  const orderId = useMemo(() => {
    if (typeof window === "undefined") {
      return null
    }

    return getOrderIdFromPath(window.location.pathname)
  }, [])

  useEffect(() => {
    if (!orderId) {
      return
    }

    const load = async () => {
      setLoading(true)

      try {
        const response = await fetch(`/admin/orders/${orderId}`, {
          credentials: "include",
        })

        if (!response.ok) {
          return
        }

        const data = await response.json()
        setOrder(extractOrder(data))
      } catch {
        // Ignore widget fetch failures to keep order page stable.
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [orderId])

  const metadata = (order?.metadata || {}) as Record<string, unknown>
  const code =
    typeof metadata.oweg10_code === "string" ? metadata.oweg10_code : null
  const applied =
    metadata.oweg10_applied === true ||
    typeof metadata.oweg10_applied === "string"
  const consumed = metadata.oweg10_consumed === true
  const pending = metadata.oweg10_pending === true
  const discountRupees =
    typeof metadata.oweg10_discount_rupees === "number"
      ? metadata.oweg10_discount_rupees
      : typeof metadata.oweg10_discount_minor === "number"
        ? Number(metadata.oweg10_discount_minor) / 100
        : 0
  const consumedAt =
    typeof metadata.oweg10_consumed_at === "string"
      ? metadata.oweg10_consumed_at
      : null

  if (!loading && !code && !applied && !consumed && !pending) {
    return null
  }

  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base px-6 py-5">
      <div className="flex items-center justify-between gap-3 pb-4">
        <div>
          <Heading level="h3" className="text-base">
            Promotion Summary
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Human-readable status for the customer coupon on this order.
          </Text>
        </div>
        <Badge size="small" className="uppercase">
          {consumed ? "Consumed" : pending ? "Pending" : "Applied"}
        </Badge>
      </div>

      {loading ? (
        <Text size="small" className="text-ui-fg-subtle">
          Loading promotion details...
        </Text>
      ) : (
        <div className="grid gap-2">
          <InfoRow label="Coupon Code" value={code || "OWEG10"} />
          <InfoRow
            label="Discount Applied"
            value={
              discountRupees > 0 ? formatRupees(discountRupees) : "Not available"
            }
          />
          <InfoRow
            label="Offer Type"
            value="10% off · One-time per customer"
          />
          <InfoRow
            label="Coupon Status"
            value={consumed ? "Consumed permanently" : pending ? "Reserved on this order" : "Applied"}
          />
          <InfoRow
            label="Consumed At"
            value={consumed ? formatDate(consumedAt) : "Not consumed yet"}
          />
          <InfoRow
            label="Policy"
            value="Once attached to a placed order, it cannot be reused."
          />
        </div>
      )}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.before",
})

export default OrderOweg10SummaryWidget
