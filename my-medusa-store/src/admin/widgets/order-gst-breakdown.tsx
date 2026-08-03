import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useMemo } from "react"
import {
  mountOrderGstTaxTotalPatch,
  type OrderGstPatchSummary,
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

/**
 * Invisible widget: patches Medusa's Summary "Tax Total" row with
 * inclusive GST + Taxable/CGST/SGST, then vendor settlement lines
 * (commission, TCS, TDS, net). Does not change order.tax_total in the DB.
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
        const res = await fetch(`/admin/orders/${orderId}/gst-breakdown`, {
          credentials: "include",
        })
        if (!res.ok) return
        const data = await res.json()
        const summary = data?.summary as GstSummary | null
        if (cancelled || !summary) return
        const vendorSettlement = data?.vendor_settlement as
          | OrderVendorSettlementPatch
          | null
          | undefined
        unmountPatch = mountOrderGstTaxTotalPatch({
          ...summary,
          vendor_settlement: vendorSettlement || null,
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
  zone: "order.details.before",
})

export default OrderGstBreakdownWidget
