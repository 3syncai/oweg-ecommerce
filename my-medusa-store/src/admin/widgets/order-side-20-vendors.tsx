import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Heading, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

type VendorAcceptanceItem = {
  id: string
  title?: string
  variant_title?: string | null
  sku?: string | null
  quantity?: number
}

type VendorAcceptance = {
  vendor_id: string
  vendor_name?: string | null
  store_name?: string | null
  vendor_email?: string | null
  vendor_phone?: string | null
  accepted: boolean
  acceptance_label: string
  stage: string
  stage_label: string
  can_mark_delivered?: boolean
  accepted_at?: string | null
  shipping_method?: string | null
  shipping_provider?: string | null
  easy_courier_partner?: string | null
  self_courier_partner?: string | null
  self_awb?: string | null
  shiprocket_awb?: string | null
  shiprocket_status?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  label_url?: string | null
  invoice_generated_at?: string | null
  rtd_at?: string | null
  items: VendorAcceptanceItem[]
  item_count: number
}

type VendorAcceptanceResponse = {
  status?: string
  cancellation?: {
    is_cancelled?: boolean
    source?: "admin" | "customer" | null
    note?: string | null
    vendor_message?: string | null
    cancelled_by_label?: string
  }
  vendors: VendorAcceptance[]
  summary: {
    vendor_count: number
    accepted_count: number
    pending_count: number
    all_accepted: boolean
    any_accepted: boolean
    status_label: string
  }
}

function getOrderIdFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  const index = parts.indexOf("orders")
  if (index === -1) return null
  return parts[index + 1] || null
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const Detail = ({ label, value }: { label: string; value: ReactNode }) => {
  if (value == null || value === "" || value === "—") return null
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <Text size="small" className="text-ui-fg-muted shrink-0">
        {label}
      </Text>
      <Text size="small" weight="plus" className="text-right break-all text-ui-fg-base">
        {value}
      </Text>
    </div>
  )
}

function stageBadgeColor(
  vendor: VendorAcceptance
): "green" | "orange" | "blue" | "grey" | "red" {
  if (vendor.stage === "delivered") return "green"
  if (vendor.stage === "in_transit" || vendor.stage === "to_dispatch") return "blue"
  if (vendor.accepted) return "green"
  return "orange"
}

const OrderVendorAcceptanceWidget = () => {
  const [data, setData] = useState<VendorAcceptanceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [markingVendorId, setMarkingVendorId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  const orderId = useMemo(() => {
    if (typeof window === "undefined") return null
    return getOrderIdFromPath(window.location.pathname)
  }, [])

  const load = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/admin/orders/${orderId}/vendor-acceptance`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const json = (await res.json()) as VendorAcceptanceResponse
      setData(json)
    } catch (e: any) {
      setError(e?.message || "Failed to load vendor status")
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    if (!orderId) return
    void load()
    const intervalId = window.setInterval(() => void load(), 20000)
    return () => window.clearInterval(intervalId)
  }, [orderId, load])

  const markDelivered = async (vendorId?: string) => {
    if (!orderId) return
    if (vendorId) setMarkingVendorId(vendorId)
    else setMarkingAll(true)

    try {
      const res = await fetch(`/admin/orders/${orderId}/mark-delivered`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vendorId ? { vendor_id: vendorId } : {}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.message || `Failed (${res.status})`)
      }
      toast.success(
        vendorId
          ? "Vendor marked as delivered"
          : "Order marked as delivered for all vendors"
      )
      await load()
    } catch (e: any) {
      toast.error(e?.message || "Failed to mark as delivered")
    } finally {
      setMarkingVendorId(null)
      setMarkingAll(false)
    }
  }

  if (!orderId) return null

  const summary = data?.summary
  const vendors = data?.vendors || []
  const orderCancelled =
    data?.cancellation?.is_cancelled === true ||
    String(data?.status || "").toLowerCase() === "canceled" ||
    String(data?.status || "").toLowerCase() === "cancelled"
  const anyCanMark = !orderCancelled && vendors.some((v) => v.can_mark_delivered)

  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-xl border border-ui-border-base overflow-hidden transition-shadow duration-200 hover:shadow-elevation-card-hover">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ui-border-base">
        <div className="min-w-0">
          <Heading level="h2" className="text-ui-fg-base">
            Vendors
          </Heading>
          <Text size="small" className="text-ui-fg-muted mt-0.5">
            {summary
              ? `${summary.accepted_count}/${summary.vendor_count} accepted`
              : "Acceptance & dispatch"}
          </Text>
        </div>
        {orderCancelled ? (
          <Badge size="small" color="red" className="shrink-0">
            Cancelled
          </Badge>
        ) : summary ? (
          <Badge
            size="small"
            color={
              summary.all_accepted ? "green" : summary.any_accepted ? "orange" : "grey"
            }
            className="shrink-0"
          >
            {summary.status_label}
          </Badge>
        ) : null}
      </div>

      <div className="px-5 py-4 space-y-4">
        {orderCancelled && (
          <div className="rounded-lg border border-ui-border-error/40 bg-ui-bg-subtle px-3.5 py-3">
            <Text size="small" weight="plus" className="text-ui-fg-base">
              {data?.cancellation?.cancelled_by_label || "This order has been cancelled."}
            </Text>
            {data?.cancellation?.vendor_message || data?.cancellation?.note ? (
              <Text size="small" className="text-ui-fg-muted mt-1 leading-relaxed">
                {data.cancellation.vendor_message || data.cancellation.note}
              </Text>
            ) : null}
          </div>
        )}

        {loading && !data && (
          <Text size="small" className="text-ui-fg-muted">
            Loading…
          </Text>
        )}
        {error && (
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        )}
        {!loading && !error && vendors.length === 0 && (
          <Text size="small" className="text-ui-fg-muted">
            No vendor-linked products on this order.
          </Text>
        )}

        {anyCanMark && (
          <Button
            size="small"
            variant="secondary"
            isLoading={markingAll}
            disabled={markingAll || Boolean(markingVendorId)}
            onClick={() => void markDelivered()}
          >
            Mark all delivered
          </Button>
        )}

        {vendors.map((vendor) => (
          <article
            key={vendor.vendor_id}
            className="rounded-xl bg-ui-bg-subtle/60 px-3.5 py-3.5 space-y-2.5 transition-colors duration-150 hover:bg-ui-bg-subtle"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Text size="small" weight="plus" className="truncate text-ui-fg-base">
                  {vendor.store_name || vendor.vendor_name || "Vendor"}
                </Text>
                {vendor.vendor_name && vendor.store_name ? (
                  <Text size="xsmall" className="text-ui-fg-muted truncate">
                    {vendor.vendor_name}
                  </Text>
                ) : null}
              </div>
              <Badge size="small" color={stageBadgeColor(vendor)} className="shrink-0">
                {vendor.stage === "delivered"
                  ? "Delivered"
                  : vendor.accepted
                    ? vendor.stage_label || "Accepted"
                    : "Awaiting"}
              </Badge>
            </div>

            <div className="space-y-0.5">
              <Detail label="Status" value={vendor.acceptance_label} />
              <Detail label="Accepted" value={formatDate(vendor.accepted_at)} />
              <Detail label="Email" value={vendor.vendor_email} />
              <Detail label="Phone" value={vendor.vendor_phone} />

              {vendor.shipping_method ? (
                <Detail
                  label="Shipping"
                  value={
                    vendor.shipping_method === "easy"
                      ? `Easy · ${
                          vendor.easy_courier_partner ||
                          (vendor.shipping_provider === "itl" ? "ITL" : "Shiprocket")
                        }`
                      : `Self · ${vendor.self_courier_partner || "Carrier"}`
                  }
                />
              ) : null}

              {(vendor.shiprocket_awb || vendor.self_awb || vendor.tracking_number) && (
                <Detail
                  label="AWB"
                  value={
                    vendor.tracking_number || vendor.shiprocket_awb || vendor.self_awb
                  }
                />
              )}

              {vendor.tracking_url ? (
                <Detail
                  label="Tracking"
                  value={
                    <a
                      href={vendor.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ui-fg-interactive hover:underline"
                    >
                      Open
                    </a>
                  }
                />
              ) : null}

              {vendor.label_url ? (
                <Detail
                  label="Label"
                  value={
                    <a
                      href={vendor.label_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ui-fg-interactive hover:underline"
                    >
                      Open
                    </a>
                  }
                />
              ) : null}

              {vendor.shiprocket_status ? (
                <Detail label="Courier" value={vendor.shiprocket_status} />
              ) : null}
              {vendor.invoice_generated_at ? (
                <Detail label="Invoice" value={formatDate(vendor.invoice_generated_at)} />
              ) : null}
              {vendor.rtd_at ? (
                <Detail label="RTD" value={formatDate(vendor.rtd_at)} />
              ) : null}
            </div>

            {vendor.can_mark_delivered && !orderCancelled ? (
              <div className="pt-1">
                <Button
                  size="small"
                  isLoading={markingVendorId === vendor.vendor_id}
                  disabled={markingAll || Boolean(markingVendorId)}
                  onClick={() => void markDelivered(vendor.vendor_id)}
                >
                  Mark delivered
                </Button>
              </div>
            ) : null}

            {vendor.items?.length > 0 ? (
              <div className="pt-2.5 border-t border-ui-border-base/70 space-y-1">
                <Text
                  size="xsmall"
                  weight="plus"
                  className="text-ui-fg-muted uppercase tracking-wider"
                >
                  Items · {vendor.item_count}
                </Text>
                {vendor.items.map((item) => (
                  <Text key={item.id} size="small" className="text-ui-fg-subtle leading-snug">
                    {item.title}
                    {item.variant_title ? ` · ${item.variant_title}` : ""}
                    {item.sku ? ` · ${item.sku}` : ""}
                    {` × ${item.quantity ?? 1}`}
                  </Text>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderVendorAcceptanceWidget
