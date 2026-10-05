import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useMemo } from "react"
import {
  mountOrderGstTaxTotalPatch,
  type OrderGstPatchSummary,
  type OrderPartnerSalePatch,
  type OrderVendorSettlementPatch,
} from "../lib/order-gst-tax-total-patch"

type GstSummary = OrderGstPatchSummary & {
  note?: string
  lines: Array<{
    item_id: string
    title: string
    quantity: number
    tax_code: string | null
    rate: number
    inclusive: number
    taxable: number
    gst: number
    cgst: number
    sgst: number
  }>
}

function getOrderIdFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  const index = parts.indexOf("orders")
  if (index === -1) return null
  return parts[index + 1] || null
}

function extractOrder(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null
  const root = data as Record<string, unknown>
  if (root.order && typeof root.order === "object") {
    return root.order as Record<string, unknown>
  }
  return root
}

function readCoinDiscount(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return { amount: 0, code: null as string | null }
  const amount =
    typeof metadata.coins_discounted === "number"
      ? metadata.coins_discounted
      : typeof metadata.coins_discountend === "number"
        ? metadata.coins_discountend
        : typeof metadata.coin_discount_rupees === "number"
          ? metadata.coin_discount_rupees
          : typeof metadata.coin_discount_minor === "number"
            ? metadata.coin_discount_minor / 100
            : 0
  const code =
    typeof metadata.coin_discount_code === "string"
      ? metadata.coin_discount_code
      : null
  return { amount, code }
}

/**
 * Invisible data widget: loads GST + settlement + coin discount and injects
 * them into the Medusa Summary card (no separate side Settlement card).
 */
const OrderGstBreakdownWidget = () => {
  const orderId = useMemo(() => {
    if (typeof window === "undefined") return null
    return getOrderIdFromPath(window.location.pathname)
  }, [])

  useEffect(() => {
    if (!orderId) return

    let unmountPatch: (() => void) | null = null
    let cancelled = false

    const load = async () => {
      try {
        const [gstRes, orderRes] = await Promise.all([
          fetch(`/admin/orders/${orderId}/gst-breakdown`, {
            credentials: "include",
          }),
          fetch(`/admin/orders/${orderId}`, { credentials: "include" }),
        ])
        if (!gstRes.ok || cancelled) return

        const data = await gstRes.json()
        const nextSummary = data?.summary as GstSummary | null
        if (!nextSummary || cancelled) return

        const nextSettlement =
          (data?.vendor_settlement as OrderVendorSettlementPatch | null) || null
        const nextPartner =
          (data?.partner_sale as OrderPartnerSalePatch | null) || null

        let coinAmount = 0
        let coinCode: string | null = null
        if (orderRes.ok) {
          const orderData = await orderRes.json()
          const order = extractOrder(orderData)
          const meta = (order?.metadata || null) as Record<string, unknown> | null
          const coin = readCoinDiscount(meta)
          coinAmount = coin.amount
          coinCode = coin.code
        }

        unmountPatch?.()
        unmountPatch = mountOrderGstTaxTotalPatch({
          ...nextSummary,
          vendor_settlement: nextSettlement,
          partner_sale: nextPartner,
          coin_discount: coinAmount,
          coin_discount_code: coinCode,
        })
      } catch {
        // Keep Medusa Tax Total as-is if breakdown fails
      }
    }

    void load()

    return () => {
      cancelled = true
      unmountPatch?.()
    }
  }, [orderId])

  return null
}

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
})

export default OrderGstBreakdownWidget
