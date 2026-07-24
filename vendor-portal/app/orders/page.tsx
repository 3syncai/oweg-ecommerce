"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { MouseEvent, ReactNode } from "react"
import { Button, Container, Heading, Text, clx } from "@medusajs/ui"
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Copy,
  Eye,
  FileText,
  PackageCheck,
  Search,
  Truck,
} from "lucide-react"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import EmptyState from "@/components/EmptyState"
import StatusDot from "@/components/dashboard/StatusDot"
import { vendorOrdersApi } from "@/lib/api/client"
import { useRouter } from "next/navigation"

type VendorStage = "to_accept" | "to_pack" | "to_dispatch" | "in_transit" | "delivered"
type StageFilter = "total" | VendorStage

type VendorWorkflow = {
  stage?: VendorStage
  accepted_at?: string
  shipping_method?: "easy" | "self"
  shiprocket_order_id?: string | null
  shiprocket_awb?: string | null
  shiprocket_status?: string | null
  self_courier_partner?: string | null
  self_tracking_source?: "shiprocket" | "carrier_api" | "manual" | null
  self_awb?: string | null
  self_dispatch_rate?: number | null
  self_packing_info?: string | null
  invoice_generated_at?: string
  rtd_at?: string
}

type VendorOrder = {
  id: string
  display_id?: string | number
  email?: string
  status?: string
  fulfillment_status?: string
  vendor_stage: VendorStage
  vendor_status_label: string
  payment_type?: "Prepaid" | "PostPaid" | string
  total: number
  currency_code?: string
  created_at: string
  product_names?: string[]
  items?: Array<{ id: string; title: string; variant_title?: string; quantity: number; unit_price?: number }>
  shipping_address?: Record<string, any> | null
  billing_address?: Record<string, any> | null
  vendor_workflow?: VendorWorkflow
}

const PAGE_SIZE = 10

const stageConfig: Array<{
  key: StageFilter
  label: string
  subtext: string
  icon: ReactNode
}> = [
  { key: "total", label: "Total orders", subtext: "All received", icon: <Clipboard size={18} /> },
  { key: "to_accept", label: "To Accept", subtext: "Confirm first", icon: <CheckCircle2 size={18} /> },
  { key: "to_pack", label: "To Pack", subtext: "Ship + invoice", icon: <PackageCheck size={18} /> },
  { key: "to_dispatch", label: "To Dispatch", subtext: "Ready to move", icon: <Truck size={18} /> },
  { key: "in_transit", label: "In Transit", subtext: "On the way", icon: <Truck size={18} /> },
  { key: "delivered", label: "Delivered", subtext: "Completed", icon: <CheckCircle2 size={18} /> },
]

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

const formatCurrency = (amount: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount || 0)

const compactOrderId = (order: VendorOrder) => {
  const id = String(order.id || order.display_id || "")
  if (id.length <= 18) return id ? `#${id}` : "N/A"
  return `#${id.slice(0, 10)}...${id.slice(-5)}`
}

const addressLine = (address?: Record<string, any> | null) => {
  if (!address) return "N/A"
  return [
    `${address.first_name || ""} ${address.last_name || ""}`.trim(),
    address.address_1,
    address.address_2,
    address.city,
    address.province,
    address.postal_code,
    address.country_code,
  ]
    .filter(Boolean)
    .join(", ")
}

const customerName = (order: VendorOrder) => {
  const address = order.shipping_address || order.billing_address
  return `${address?.first_name || ""} ${address?.last_name || ""}`.trim() || "N/A"
}

const customerPhone = (order: VendorOrder) => {
  return String(order.shipping_address?.phone || order.billing_address?.phone || "N/A")
}

const stageVariant = (stage: VendorStage) => {
  if (stage === "delivered") return "success"
  if (stage === "in_transit") return "info"
  if (stage === "to_dispatch") return "info"
  return "warning"
}

const VendorOrdersPage = () => {
  const router = useRouter()
  const [orders, setOrders] = useState<VendorOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStage, setSelectedStage] = useState<StageFilter>("total")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [processing, setProcessing] = useState<string | null>(null)
  const [detailOrder, setDetailOrder] = useState<VendorOrder | null>(null)
  const [tracking, setTracking] = useState<any>(null)
  const [acceptCandidate, setAcceptCandidate] = useState<VendorOrder | null>(null)
  const [selfShipOrder, setSelfShipOrder] = useState<VendorOrder | null>(null)
  const [selfShipping, setSelfShipping] = useState({
    courier_partner_name: "",
    tracking_source: "shiprocket" as "shiprocket" | "carrier_api" | "manual",
    awb: "",
    dispatch_rate: "",
    packing_info: "",
  })

  const replaceOrder = useCallback((next: VendorOrder) => {
    setOrders((current) => current.map((order) => (order.id === next.id ? next : order)))
  }, [])

  const loadOrders = useCallback(async () => {
    try {
      const data = await vendorOrdersApi.list()
      setOrders(data?.orders || [])
      setError(null)
    } catch (e: any) {
      if (e.status === 403) {
        router.push("/pending")
        return
      }
      setError(e?.message || "Failed to load orders")
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      router.push("/login")
      return
    }
    void loadOrders()
  }, [router, loadOrders])

  useEffect(() => {
    setPage(1)
  }, [selectedStage, search])

  const counts = useMemo(() => {
    const base: Record<StageFilter, number> = {
      total: orders.length,
      to_accept: 0,
      to_pack: 0,
      to_dispatch: 0,
      in_transit: 0,
      delivered: 0,
    }
    orders.forEach((order) => {
      base[order.vendor_stage] += 1
    })
    return base
  }, [orders])

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    return orders.filter((order) => {
      if (selectedStage !== "total" && order.vendor_stage !== selectedStage) return false
      if (!query) return true
      return (
        String(order.id).toLowerCase().includes(query) ||
        String(order.display_id || "").toLowerCase().includes(query) ||
        String(order.email || "").toLowerCase().includes(query) ||
        (order.product_names || []).join(" ").toLowerCase().includes(query)
      )
    })
  }, [orders, search, selectedStage])

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))
  const visibleOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openDetails = async (order: VendorOrder, withTracking = false) => {
    setDetailOrder(order)
    setTracking(null)
    setProcessing(`track:${order.id}`)
    try {
      if (withTracking) {
        const data = await vendorOrdersApi.track(order.id)
        replaceOrder(data.order)
        setDetailOrder(data.order)
        setTracking(data.tracking)
        return
      }

      const data = await vendorOrdersApi.get(order.id)
      replaceOrder(data.order)
      setDetailOrder(data.order)
    } catch (e: any) {
      if (withTracking) {
        setTracking({ error: e?.message || "Tracking is unavailable" })
      } else {
        setError(e?.message || "Failed to load order details")
      }
    } finally {
      setProcessing(null)
    }
  }

  const acceptOrder = async (order: VendorOrder) => {
    setProcessing(`accept:${order.id}`)
    try {
      const data = await vendorOrdersApi.accept(order.id)
      replaceOrder(data.order)
      setSelectedStage("to_pack")
      setAcceptCandidate(null)
    } catch (e: any) {
      setError(e?.message || "Failed to accept order")
    } finally {
      setProcessing(null)
    }
  }

  const chooseEasyShipping = async (order: VendorOrder) => {
    setProcessing(`easy:${order.id}`)
    try {
      const data = await vendorOrdersApi.chooseEasyShipping(order.id)
      replaceOrder(data.order)
    } catch (e: any) {
      setError(e?.message || "Failed to create Easy Shipping order")
    } finally {
      setProcessing(null)
    }
  }

  const submitSelfShipping = async () => {
    if (!selfShipOrder) return
    setProcessing(`self:${selfShipOrder.id}`)
    try {
      const data = await vendorOrdersApi.chooseSelfShipping(selfShipOrder.id, {
        courier_partner_name: selfShipping.courier_partner_name.trim(),
        tracking_source: selfShipping.tracking_source,
        awb: selfShipping.awb.trim(),
        dispatch_rate: Number(selfShipping.dispatch_rate),
        packing_info: selfShipping.packing_info.trim(),
      })
      replaceOrder(data.order)
      setSelfShipOrder(null)
    } catch (e: any) {
      setError(e?.message || "Failed to save self shipping")
    } finally {
      setProcessing(null)
    }
  }

  const generateInvoice = async (order: VendorOrder) => {
    setProcessing(`invoice:${order.id}`)
    try {
      const blob = await vendorOrdersApi.generateInvoice(order.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `Invoice-${order.display_id || order.id}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      replaceOrder({
        ...order,
        vendor_workflow: {
          ...(order.vendor_workflow || {}),
          invoice_generated_at: new Date().toISOString(),
        },
      })
    } catch (e: any) {
      setError(e?.message || "Failed to generate invoice")
    } finally {
      setProcessing(null)
    }
  }

  const markReadyToDispatch = async (order: VendorOrder) => {
    setProcessing(`rtd:${order.id}`)
    try {
      const data = await vendorOrdersApi.markReadyToDispatch(order.id)
      replaceOrder(data.order)
      setSelectedStage("to_dispatch")
    } catch (e: any) {
      setError(e?.message || "Failed to mark RTD")
    } finally {
      setProcessing(null)
    }
  }

  const renderAction = (order: VendorOrder) => {
    const workflow = order.vendor_workflow || {}
    const busy = processing?.endsWith(order.id)
    const hasShipping = Boolean(workflow.shipping_method)
    const hasInvoice = Boolean(workflow.invoice_generated_at)

    if (selectedStage === "total") {
      return <ActionButton icon={<Eye size={14} />} label="View" onClick={() => void openDetails(order)} />
    }

    if (selectedStage === "to_accept") {
      return (
        <ActionButton
          icon={<CheckCircle2 size={14} />}
          label={busy ? "Accepting" : "Accept"}
          disabled={busy}
          onClick={() => setAcceptCandidate(order)}
        />
      )
    }

    if (selectedStage === "to_pack") {
      return (
        <div className="grid min-w-[220px] grid-cols-3 gap-1.5">
          <ActionButton
            icon={<Truck size={14} />}
            label="Easy"
            disabled={busy || (hasShipping && workflow.shipping_method !== "easy")}
            active={workflow.shipping_method === "easy"}
            onClick={() => void chooseEasyShipping(order)}
          />
          <ActionButton
            icon={<PackageCheck size={14} />}
            label="Self"
            disabled={busy || (hasShipping && workflow.shipping_method !== "self")}
            active={workflow.shipping_method === "self"}
            onClick={() => {
              setSelfShipOrder(order)
              setSelfShipping({
                courier_partner_name: workflow.self_courier_partner || "",
                tracking_source: workflow.self_tracking_source || "shiprocket",
                awb: workflow.self_awb || "",
                dispatch_rate: workflow.self_dispatch_rate ? String(workflow.self_dispatch_rate) : "",
                packing_info: workflow.self_packing_info || "",
              })
            }}
          />
          {hasInvoice ? (
            <ActionButton
              icon={<Truck size={14} />}
              label="RTD"
              disabled={busy}
              onClick={() => void markReadyToDispatch(order)}
            />
          ) : (
            <ActionButton
              icon={<FileText size={14} />}
              label="Invoice"
              disabled={busy || !hasShipping}
              onClick={() => void generateInvoice(order)}
            />
          )}
        </div>
      )
    }

    return (
      <ActionButton
        icon={<Truck size={14} />}
        label={order.vendor_stage === "delivered" ? "Details" : "Track"}
        disabled={busy}
        onClick={() => void openDetails(order, true)}
      />
    )
  }

  let content

  if (loading) {
    content = <PageSkeleton label="Loading orders..." stats={6} rows={8} cols={6} showAction />
  } else if (error && orders.length === 0) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      </Container>
    )
  } else {
    content = (
      <Container className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              Orders
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              Accept, pack, dispatch, and track customer orders for your catalog.
            </Text>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
            <Text size="small" className="text-ui-fg-error">{error}</Text>
          </div>
        )}

        {orders.length === 0 ? (
          <EmptyState
            accent="oweg"
            icon={<Truck />}
            title="No orders yet"
            description="When customers place an order for your products, they will show up here."
            primaryAction={{ label: "View products", onClick: () => router.push("/products") }}
            secondaryAction={{ label: "Go to dashboard", onClick: () => router.push("/dashboard") }}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              {stageConfig.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelectedStage(item.key)}
                  className={clx(
                    "rounded-xl border bg-ui-bg-base p-4 text-left transition-all hover:border-ui-border-strong hover:shadow-sm",
                    selectedStage === item.key
                      ? "border-oweg-500/50 ring-2 ring-oweg-500/15"
                      : "border-ui-border-base/70"
                  )}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-oweg-500/10 text-oweg-700">
                      {item.icon}
                    </span>
                    <Text className="text-2xl font-semibold">{counts[item.key]}</Text>
                  </div>
                  <Text weight="plus" className="text-sm">{item.label}</Text>
                  <Text size="small" className="mt-0.5 text-ui-fg-subtle">{item.subtext}</Text>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Heading level="h2" className="text-lg">Order Summary</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  {filteredOrders.length} order{filteredOrders.length === 1 ? "" : "s"} in this view
                </Text>
              </div>
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-fg-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search order, customer, product..."
                  className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ui-fg-muted focus:border-ui-border-strong"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base">
              <div className="hidden border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3 md:grid md:grid-cols-[110px_140px_minmax(0,1.4fr)_110px_130px_240px] md:gap-4">
                {["Date", "Order ID", "Product", "Payment", "Status", "Action"].map((heading) => (
                  <Text key={heading} size="small" weight="plus" className="text-ui-fg-subtle">
                    {heading}
                  </Text>
                ))}
              </div>

              {visibleOrders.length === 0 ? (
                <div className="p-10 text-center">
                  <Text className="text-ui-fg-subtle">No orders match this KPI or search.</Text>
                  <Button variant="transparent" className="mt-3" onClick={() => { setSearch(""); setSelectedStage("total") }}>
                    Clear filters
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-ui-border-base/70">
                  {visibleOrders.map((order) => (
                    <div
                      key={order.id}
                      className="grid grid-cols-1 gap-3 px-4 py-4 transition-colors hover:bg-ui-bg-subtle/60 md:grid-cols-[110px_140px_minmax(0,1.4fr)_110px_130px_240px] md:items-center md:gap-4"
                    >
                      <Text size="small">{formatDate(order.created_at)}</Text>
                      <OrderIdCell
                        order={order}
                        clickable={selectedStage !== "total"}
                        onOpen={() => void openDetails(order)}
                      />
                      <Text size="small" className="truncate" title={(order.product_names || []).join(", ")}>
                        {(order.product_names || order.items?.map((item) => item.title) || []).join(", ") || "N/A"}
                      </Text>
                      <Text size="small">{order.payment_type || "Prepaid"}</Text>
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot variant={stageVariant(order.vendor_stage) as any} />
                        <Text size="small">{order.vendor_status_label}</Text>
                      </span>
                      <div>{renderAction(order)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 text-ui-fg-muted sm:flex-row sm:items-center sm:justify-between">
              <Text size="small">
                Showing {visibleOrders.length ? (page - 1) * PAGE_SIZE + 1 : 0}-
                {Math.min(page * PAGE_SIZE, filteredOrders.length)} of {filteredOrders.length}
              </Text>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <Text size="small">Page {page} of {pageCount}</Text>
                <button
                  type="button"
                  disabled={page >= pageCount}
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}

        {detailOrder && (
          <DetailsModal
            order={detailOrder}
            tracking={tracking}
            onClose={() => {
              setDetailOrder(null)
              setTracking(null)
            }}
          />
        )}

        {acceptCandidate && (
          <AcceptConfirmModal
            order={acceptCandidate}
            busy={processing === `accept:${acceptCandidate.id}`}
            onClose={() => setAcceptCandidate(null)}
            onConfirm={() => void acceptOrder(acceptCandidate)}
          />
        )}

        {selfShipOrder && (
          <SelfShippingModal
            order={selfShipOrder}
            form={selfShipping}
            busy={processing === `self:${selfShipOrder.id}`}
            onChange={setSelfShipping}
            onClose={() => setSelfShipOrder(null)}
            onSubmit={() => void submitSelfShipping()}
          />
        )}
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

function OrderIdCell({
  order,
  clickable,
  onOpen,
}: {
  order: VendorOrder
  clickable: boolean
  onOpen: () => void
}) {
  const idText = compactOrderId(order)
  const copyId = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    void navigator.clipboard?.writeText(order.id)
  }

  return (
    <div className="group flex min-w-0 items-center gap-1">
      <button
        type="button"
        disabled={!clickable}
        onClick={onOpen}
        title={clickable ? "Open order details" : order.id}
        className={clx(
          "min-w-0 truncate rounded-md px-0.5 py-1 text-left text-sm font-semibold text-ui-fg-base",
          clickable && "hover:text-oweg-700 focus:outline-none focus:ring-2 focus:ring-oweg-500/20"
        )}
      >
        {idText}
      </button>
      <button
        type="button"
        title="Copy full order id"
        onClick={copyId}
        className="rounded-md p-1 text-ui-fg-muted opacity-0 transition hover:bg-ui-bg-base-hover hover:text-ui-fg-base group-hover:opacity-100 focus:opacity-100"
      >
        <Copy size={13} />
      </button>
    </div>
  )
}

function ActionButton({
  icon,
  label,
  disabled,
  active,
  onClick,
}: {
  icon: ReactNode
  label: string
  disabled?: boolean
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clx(
        "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium transition",
        active
          ? "border-oweg-500/40 bg-oweg-500/10 text-oweg-800"
          : "border-ui-border-base/70 bg-ui-bg-base text-ui-fg-base hover:border-ui-border-strong hover:bg-ui-bg-subtle",
        disabled && "cursor-not-allowed opacity-50"
      )}
      title={label}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

function AcceptConfirmModal({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: VendorOrder
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-ui-border-base bg-ui-bg-base shadow-xl">
        <div className="border-b border-ui-border-base px-5 py-4">
          <Heading level="h2" className="text-xl">Accept order?</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Confirm that you want to move {compactOrderId(order)} to To Pack.
          </Text>
        </div>
        <div className="space-y-3 p-5">
          <InfoBlock
            title="Order"
            rows={[
              ["Order ID", order.id],
              ["Customer", customerName(order)],
              ["Contact", customerPhone(order)],
              ["Payment", order.payment_type || "Prepaid"],
            ]}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-ui-border-base px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy}>{busy ? "Accepting..." : "Confirm accept"}</Button>
        </div>
      </div>
    </div>
  )
}

function DetailsModal({
  order,
  tracking,
  onClose,
}: {
  order: VendorOrder
  tracking: any
  onClose: () => void
}) {
  const workflow = order.vendor_workflow || {}
  const timelineSource: Array<[string, string]> = [
    ["Order placed", order.created_at],
    ["Accepted", workflow.accepted_at || ""],
    ["Shipping selected", workflow.shipping_method || ""],
    ["Invoice generated", workflow.invoice_generated_at || ""],
    ["Ready to dispatch", workflow.rtd_at || ""],
    ["Current status", order.vendor_status_label],
  ]
  const timeline = timelineSource.filter(([, value]) => Boolean(value))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-ui-border-base bg-ui-bg-base shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-ui-border-base px-5 py-4">
          <div>
            <Heading level="h2" className="text-xl">Order {compactOrderId(order)}</Heading>
            <Text size="small" className="text-ui-fg-subtle">{order.email || "No customer email"}</Text>
          </div>
          <Button variant="secondary" size="small" onClick={onClose}>Close</Button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <InfoBlock
            title="Order Details"
            rows={[
              ["Order ID", order.id],
              ["Date", formatDate(order.created_at)],
              ["Payment", order.payment_type || "Prepaid"],
              ["Status", order.vendor_status_label],
              ["Amount", formatCurrency(order.total, order.currency_code || "INR")],
            ]}
          />
          <InfoBlock
            title="Customer Details"
            rows={[
              ["Full name", customerName(order)],
              ["Contact number", customerPhone(order)],
              ["Email ID", order.email || "N/A"],
              ["Billing address", addressLine(order.billing_address)],
              ["Shipping address", addressLine(order.shipping_address)],
            ]}
          />
          <div className="md:col-span-2">
            <Text weight="plus" className="mb-2">Products</Text>
            <div className="overflow-hidden rounded-lg border border-ui-border-base/70">
              {(order.items || []).map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_70px_100px] gap-3 border-b border-ui-border-base/70 px-3 py-2 last:border-b-0">
                  <Text size="small" className="truncate">{item.title}</Text>
                  <Text size="small">Qty {item.quantity}</Text>
                  <Text size="small" className="text-right">{formatCurrency(Number(item.unit_price || 0), order.currency_code || "INR")}</Text>
                </div>
              ))}
            </div>
          </div>
          <InfoBlock title="Shipping" rows={[
            ["Method", workflow.shipping_method === "easy" ? "Easy Shipping" : workflow.shipping_method === "self" ? "Self Shipping" : "Not selected"],
            ["Booked through", workflow.self_tracking_source === "shiprocket" ? "Shiprocket" : workflow.self_tracking_source === "carrier_api" ? "Carrier API" : workflow.shipping_method === "self" ? "Manual" : "N/A"],
            ["Courier", workflow.self_courier_partner || (workflow.shipping_method === "easy" ? "Shiprocket" : "N/A")],
            ["AWB / Tracking", workflow.shiprocket_awb || workflow.self_awb || "N/A"],
            ["Packing", workflow.self_packing_info || "N/A"],
          ]} />
          <InfoBlock title="Timeline" rows={timeline.map(([label, value]) => [label, String(value)])} />
          {tracking && <TrackingPanel tracking={tracking} />}
        </div>
      </div>
    </div>
  )
}

function TrackingPanel({ tracking }: { tracking: any }) {
  const checkpoints = Array.isArray(tracking?.checkpoints) ? tracking.checkpoints : []
  const sourceLabel =
    tracking?.source === "carrier_api"
      ? "Carrier API"
      : tracking?.source === "shiprocket"
        ? "Shiprocket"
        : tracking?.source === "not_configured"
          ? "Not configured"
          : tracking?.source === "provider_error"
            ? "Provider error"
            : tracking?.source === "misconfigured"
              ? "Misconfigured"
              : "Manual"

  return (
    <div className="md:col-span-2 rounded-lg border border-ui-border-base/70 bg-ui-bg-subtle/30 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Text weight="plus">Tracking Status</Text>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {tracking?.source === "carrier_api" || tracking?.source === "shiprocket"
              ? "Live status fetched from the configured tracking provider."
              : "Self-shipping tracking needs a configured carrier API for live checkpoints."}
          </Text>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ui-border-base/70 bg-ui-bg-base px-3 py-1 text-sm">
          <StatusDot variant={tracking?.status === "delivered" ? "success" : tracking?.status === "in_transit" || tracking?.status === "out_for_delivery" ? "info" : "warning"} />
          {tracking?.status_label || "Not shipped"}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <InfoMini label="Courier" value={tracking?.courier_partner_name || "N/A"} />
        <InfoMini label="AWB / Tracking" value={tracking?.awb || "N/A"} />
        <InfoMini label="Tracking source" value={sourceLabel} />
      </div>

      {tracking?.error && (
        <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
          <Text size="small" className="text-amber-800">{tracking.error}</Text>
        </div>
      )}

      {tracking?.tracking_url && (
        <a
          href={tracking.tracking_url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-ui-border-base/70 bg-ui-bg-base px-3 text-sm font-medium text-ui-fg-base transition hover:border-ui-border-strong hover:bg-ui-bg-base-hover"
        >
          Open courier tracking page
        </a>
      )}

      {checkpoints.length > 0 ? (
        <div className="mt-4 space-y-3">
          {checkpoints.map((checkpoint: any, index: number) => (
            <div key={`${checkpoint?.date || index}-${checkpoint?.status || index}`} className="grid grid-cols-[14px_minmax(0,1fr)] gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-oweg-500" />
              <div>
                <Text size="small" weight="plus">{checkpoint?.status || checkpoint?.activity || "Status update"}</Text>
                <Text size="small" className="text-ui-fg-subtle">
                  {[checkpoint?.date, checkpoint?.location].filter(Boolean).join(" - ") || "No timestamp"}
                </Text>
                {checkpoint?.activity && checkpoint.activity !== checkpoint.status && (
                  <Text size="small" className="mt-0.5 text-ui-fg-subtle">{checkpoint.activity}</Text>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Text size="small" className="mt-4 text-ui-fg-subtle">
          No live courier checkpoints are available yet.
        </Text>
      )}
    </div>
  )
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ui-border-base/70 bg-ui-bg-base p-3">
      <Text size="small" className="text-ui-fg-subtle">{label}</Text>
      <Text size="small" weight="plus" className="mt-1 break-words">{value}</Text>
    </div>
  )
}

function InfoBlock({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-lg border border-ui-border-base/70 bg-ui-bg-subtle/20 p-4">
      <Text weight="plus" className="mb-3">{title}</Text>
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
            <Text size="small" className="text-ui-fg-subtle">{label}</Text>
            <Text size="small" className="min-w-0 break-words">{value}</Text>
          </div>
        ))}
      </div>
    </div>
  )
}

function SelfShippingModal({
  order,
  form,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  order: VendorOrder
  form: {
    courier_partner_name: string
    tracking_source: "shiprocket" | "carrier_api" | "manual"
    awb: string
    dispatch_rate: string
    packing_info: string
  }
  busy: boolean
  onChange: (next: {
    courier_partner_name: string
    tracking_source: "shiprocket" | "carrier_api" | "manual"
    awb: string
    dispatch_rate: string
    packing_info: string
  }) => void
  onClose: () => void
  onSubmit: () => void
}) {
  const setField = (key: keyof typeof form, value: string) => onChange({ ...form, [key]: value })
  const complete = form.courier_partner_name.trim() && form.awb.trim() && form.dispatch_rate.trim() && form.packing_info.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-ui-border-base bg-ui-bg-base shadow-xl">
        <div className="border-b border-ui-border-base px-5 py-4">
          <Heading level="h2" className="text-xl">Self Shipping</Heading>
          <Text size="small" className="text-ui-fg-subtle">{compactOrderId(order)}</Text>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Courier partner name" value={form.courier_partner_name} onChange={(value) => setField("courier_partner_name", value)} />
          <label className="block">
            <Text size="small" weight="plus" className="mb-1.5">Booked through</Text>
            <select
              value={form.tracking_source}
              onChange={(event) => setField("tracking_source", event.target.value as "shiprocket" | "carrier_api" | "manual")}
              className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base px-3 text-sm outline-none focus:border-ui-border-strong"
            >
              <option value="shiprocket">Shiprocket aggregator</option>
              <option value="carrier_api">Direct carrier API</option>
              <option value="manual">Manual tracking link only</option>
            </select>
          </label>
          <Field label="AWB / Tracking ID" value={form.awb} onChange={(value) => setField("awb", value)} />
          <Field label="Dispatch rate" type="number" value={form.dispatch_rate} onChange={(value) => setField("dispatch_rate", value)} />
          <label className="block">
            <Text size="small" weight="plus" className="mb-1.5">Packing info</Text>
            <textarea
              value={form.packing_info}
              onChange={(e) => setField("packing_info", e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base px-3 py-2 text-sm outline-none focus:border-ui-border-strong"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-ui-border-base px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onSubmit} disabled={busy || !complete}>{busy ? "Saving..." : "Save shipping"}</Button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string
  value: string
  type?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <Text size="small" weight="plus" className="mb-1.5">{label}</Text>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base px-3 text-sm outline-none focus:border-ui-border-strong"
      />
    </label>
  )
}

export default VendorOrdersPage
