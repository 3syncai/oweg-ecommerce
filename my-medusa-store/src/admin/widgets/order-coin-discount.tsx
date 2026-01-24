import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useMemo, useState } from "react"

type OrderRecord = {
  id?: string
  metadata?: Record<string, unknown> | null
}

function extractOrder(data: any): OrderRecord | null {
  if (!data || typeof data !== "object") return null
  const root = data as Record<string, unknown>
  const direct = root.order
  if (direct && typeof direct === "object") return direct as OrderRecord
  const nested = root.data
  if (nested && typeof nested === "object") {
    const nestedOrder = (nested as Record<string, unknown>).order
    if (nestedOrder && typeof nestedOrder === "object") return nestedOrder as OrderRecord
    if (Array.isArray(nested) && nested[0] && typeof nested[0] === "object") {
      return nested[0] as OrderRecord
    }
  }
  return root as OrderRecord
}

function getOrderIdFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  const index = parts.indexOf("orders")
  if (index === -1) return null
  return parts[index + 1] || null
}

const OrderCoinDiscountWidget = () => {
  const [order, setOrder] = useState<OrderRecord | null>(null)
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
        const res = await fetch(`/admin/orders/${orderId}`, { credentials: "include" })
        if (!res.ok) return
        const data = await res.json()
        const nextOrder = extractOrder(data)
        setOrder(nextOrder)
      } catch {
        // ignore fetch errors in widget
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [orderId])

  const metadata = (order?.metadata || {}) as Record<string, unknown>
  const coinDiscount =
    typeof metadata.coins_discountend === "number"
      ? metadata.coins_discountend
      : typeof metadata.coin_discount_rupees === "number"
        ? metadata.coin_discount_rupees
        : typeof metadata.coin_discount_minor === "number"
          ? metadata.coin_discount_minor / 100
          : 0

  const discountCode =
    typeof metadata.coin_discount_code === "string" ? metadata.coin_discount_code : null

  return (
    <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
      <div className="text-sm font-semibold mb-2">Coin Discount</div>
      {loading ? (
        <div className="text-xs text-ui-fg-subtle">Loading coin discount...</div>
      ) : coinDiscount > 0 ? (
        <div className="space-y-1 text-sm text-ui-fg-subtle">
          <div>
            Applied: <span className="text-ui-fg-base font-medium">₹{coinDiscount.toFixed(2)}</span>
          </div>
          {discountCode ? (
            <div>
              Code: <span className="text-ui-fg-base font-medium">{discountCode}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-xs text-ui-fg-subtle">No coin discount applied.</div>
      )}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.before",
})

export default OrderCoinDiscountWidget
