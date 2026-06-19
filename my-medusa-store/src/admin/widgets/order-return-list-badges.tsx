import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"

type OrderReturnIndex = Record<
  string,
  {
    type: string
    status: string
    reason?: string | null
  }
>

function formatBadge(entry: { type: string; status: string }) {
  const typeLabel = entry.type === "replacement" ? "Replace" : "Return"
  const statusLabel = entry.status.replace(/_/g, " ")
  return `${typeLabel}: ${statusLabel}`
}

const OrderReturnListBadgesWidget = () => {
  useEffect(() => {
    if (typeof window === "undefined") return
    const path = window.location.pathname.replace(/\/$/, "")
    if (!path.endsWith("/orders")) return

    let cancelled = false
    let index: OrderReturnIndex = {}
    let observer: MutationObserver | null = null

    const load = async () => {
      const response = await fetch("/admin/return-requests/order-index", {
        credentials: "include",
      })
      if (!response.ok) return
      const data = await response.json()
      index = (data?.orders || {}) as OrderReturnIndex
    }

    const decorate = () => {
      const rows = document.querySelectorAll("table tbody tr")
      rows.forEach((row) => {
        const link = row.querySelector('a[href*="/orders/order_"]') as HTMLAnchorElement | null
        if (!link) return
        const orderId = link.getAttribute("href")?.split("/").pop()
        if (!orderId || !index[orderId]) return
        if (row.querySelector("[data-oweg-return-badge]")) return

        const badge = document.createElement("span")
        badge.setAttribute("data-oweg-return-badge", "true")
        badge.textContent = formatBadge(index[orderId])
        badge.className =
          "ml-2 inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-800"

        link.insertAdjacentElement("afterend", badge)
      })
    }

    void load()
      .then(() => {
        if (cancelled) return
        decorate()
        observer = new MutationObserver(() => decorate())
        observer.observe(document.body, { childList: true, subtree: true })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [])

  return null
}

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default OrderReturnListBadgesWidget
