import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

type OrderRecord = {
  id?: string
  metadata?: Record<string, unknown> | null
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

function toMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function formatRupees(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value)
}

const OrderPromoSummary = () => {
  const [order, setOrder] = useState<OrderRecord | null>(null)

  useEffect(() => {
    const orderId = getOrderIdFromPath(window.location.pathname)
    if (!orderId) return

    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/admin/orders/${orderId}`, { credentials: "include" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setOrder(extractOrder(data))
      } catch {
        // ignore
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const meta = (order?.metadata || {}) as Record<string, unknown>
  const code = typeof meta.promo_code === "string" ? meta.promo_code : null
  const discount =
    toMoney(meta.promo_discount_rupees) ||
    (toMoney(meta.promo_discount_minor) > 0
      ? toMoney(meta.promo_discount_minor) / 100
      : 0)
  const label =
    typeof meta.promo_applied === "string" ? meta.promo_applied : code

  if (!code || discount <= 0) return null

  return (
    <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Heading level="h2">Promo code</Heading>
        <Badge color="green" size="2xsmall">
          Applied
        </Badge>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between gap-4">
          <Text size="small" className="text-ui-fg-subtle">
            Code
          </Text>
          <Text size="small" weight="plus">
            {code}
          </Text>
        </div>
        <div className="flex justify-between gap-4">
          <Text size="small" className="text-ui-fg-subtle">
            Discount
          </Text>
          <Text size="small" weight="plus">
            -{formatRupees(discount)}
          </Text>
        </div>
        {label ? (
          <Text size="small" className="text-ui-fg-muted">
            {label}
          </Text>
        ) : null}
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderPromoSummary
