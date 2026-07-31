import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Container, Heading, Text } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

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
  accepted_at?: string | null
  shipping_method?: string | null
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

const Detail = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-3 py-1.5">
    <Text size="small" className="text-ui-fg-subtle shrink-0">
      {label}
    </Text>
    <Text size="small" weight="plus" className="text-right break-all">
      {value || "—"}
    </Text>
  </div>
)

const OrderVendorAcceptanceWidget = () => {
  const [data, setData] = useState<VendorAcceptanceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const orderId = useMemo(() => {
    if (typeof window === "undefined") return null
    return getOrderIdFromPath(window.location.pathname)
  }, [])

  useEffect(() => {
    if (!orderId) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const res = await fetch(`/admin/orders/${orderId}/vendor-acceptance`, {
          credentials: "include",
        })
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        const json = (await res.json()) as VendorAcceptanceResponse
        if (!cancelled) setData(json)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load vendor status")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const intervalId = window.setInterval(load, 20000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [orderId])

  if (!orderId) return null

  const summary = data?.summary
  const vendors = data?.vendors || []

  return (
    <Container className="p-0 overflow-hidden divide-y">
      <div className="px-6 py-4 flex items-center justify-between gap-3">
        <div>
          <Heading level="h2">Vendor acceptance</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Status when vendors accept this order
          </Text>
        </div>
        {summary && (
          <Badge color={summary.all_accepted ? "green" : summary.any_accepted ? "orange" : "grey"}>
            {summary.status_label}
          </Badge>
        )}
      </div>

      <div className="px-6 py-4 space-y-4">
        {loading && !data && (
          <Text size="small" className="text-ui-fg-subtle">
            Loading vendor status…
          </Text>
        )}
        {error && (
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        )}
        {!loading && !error && vendors.length === 0 && (
          <Text size="small" className="text-ui-fg-subtle">
            No vendor-linked products on this order.
          </Text>
        )}

        {vendors.map((vendor) => (
          <div
            key={vendor.vendor_id}
            className="rounded-lg border border-ui-border-base px-3 py-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Text size="small" weight="plus" className="truncate">
                  {vendor.store_name || vendor.vendor_name || "Vendor"}
                </Text>
                {vendor.vendor_name && vendor.store_name && (
                  <Text size="xsmall" className="text-ui-fg-subtle truncate">
                    {vendor.vendor_name}
                  </Text>
                )}
              </div>
              <Badge color={vendor.accepted ? "green" : "orange"}>
                {vendor.accepted ? "Accepted by vendor" : "Awaiting acceptance"}
              </Badge>
            </div>

            <Detail label="Status" value={vendor.acceptance_label} />
            <Detail label="Stage" value={vendor.stage_label} />
            <Detail label="Accepted at" value={formatDate(vendor.accepted_at)} />
            <Detail label="Email" value={vendor.vendor_email} />
            <Detail label="Phone" value={vendor.vendor_phone} />

            {vendor.shipping_method && (
              <Detail
                label="Shipping"
                value={
                  vendor.shipping_method === "easy"
                    ? `Easy · ${vendor.easy_courier_partner || "Shiprocket"}`
                    : `Self · ${vendor.self_courier_partner || "Carrier"}`
                }
              />
            )}
            {(vendor.shiprocket_awb || vendor.self_awb || vendor.tracking_number) && (
              <Detail
                label="AWB / Tracking"
                value={vendor.tracking_number || vendor.shiprocket_awb || vendor.self_awb}
              />
            )}
            {vendor.tracking_url && (
              <Detail
                label="Tracking URL"
                value={
                  <a
                    href={vendor.tracking_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ui-fg-interactive underline"
                  >
                    Open tracking
                  </a>
                }
              />
            )}
            {vendor.label_url && (
              <Detail
                label="Label URL"
                value={
                  <a
                    href={vendor.label_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ui-fg-interactive underline"
                  >
                    Open label
                  </a>
                }
              />
            )}
            {vendor.shiprocket_status && (
              <Detail label="Tracking status" value={vendor.shiprocket_status} />
            )}
            {vendor.invoice_generated_at && (
              <Detail label="Invoice" value={formatDate(vendor.invoice_generated_at)} />
            )}
            {vendor.rtd_at && (
              <Detail label="Ready to dispatch" value={formatDate(vendor.rtd_at)} />
            )}

            {vendor.items?.length > 0 && (
              <div className="pt-2 border-t border-ui-border-base space-y-1">
                <Text size="xsmall" className="text-ui-fg-muted uppercase tracking-wide">
                  Items ({vendor.item_count})
                </Text>
                {vendor.items.map((item) => (
                  <Text key={item.id} size="small" className="text-ui-fg-subtle">
                    {item.title}
                    {item.variant_title ? ` · ${item.variant_title}` : ""}
                    {item.sku ? ` · ${item.sku}` : ""}
                    {` × ${item.quantity ?? 1}`}
                  </Text>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderVendorAcceptanceWidget
