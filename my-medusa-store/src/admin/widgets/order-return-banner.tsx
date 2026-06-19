import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Text } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

type ReturnRequest = {
  type: string
  status: string
  reason?: string | null
}

function getOrderIdFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  const index = parts.indexOf("orders")
  if (index === -1) return null
  return parts[index + 1] || null
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

const OrderReturnBannerWidget = () => {
  const [request, setRequest] = useState<ReturnRequest | null>(null)

  const orderId = useMemo(() => {
    if (typeof window === "undefined") return null
    return getOrderIdFromPath(window.location.pathname)
  }, [])

  useEffect(() => {
    if (!orderId) return
    const load = async () => {
      try {
        const response = await fetch(`/admin/return-requests/by-order/${orderId}`, {
          credentials: "include",
        })
        if (!response.ok) return
        const data = await response.json()
        setRequest(data?.return_request || null)
      } catch {
        // ignore
      }
    }
    void load()
  }, [orderId])

  if (!request) return null

  const typeLabel = request.type === "replacement" ? "Replacement" : "Return"

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge size="small" color={statusColor(request.status)} className="uppercase">
          {typeLabel} · {request.status.replace(/_/g, " ")}
        </Badge>
        <Text size="small" className="text-ui-fg-subtle">
          {request.reason ? `Reason: ${request.reason}` : "Customer return/replacement request is active for this order."}
        </Text>
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.before",
})

export default OrderReturnBannerWidget
