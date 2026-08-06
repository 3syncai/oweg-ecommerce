"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { useRouter, useSearchParams } from "next/navigation"

type VendorStage = "to_accept" | "to_pack" | "to_dispatch" | "in_transit" | "delivered"
type StageFilter = "total" | VendorStage

type VendorWorkflow = {
  stage?: VendorStage
  accepted_at?: string
  shipping_method?: "easy" | "self"
  shiprocket_order_id?: string | number | null
  shiprocket_shipment_id?: string | number | null
  shiprocket_awb?: string | null
  shiprocket_status?: string | null
  easy_courier_id?: number | null
  easy_courier_partner?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  label_url?: string | null
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
  taxable_amount?: number | null
  gst_amount?: number | null
  tcs_amount?: number | null
  tds_amount?: number | null
  commission_amount?: number | null
  settlement?: {
    taxable_amount: number
    gst_amount: number
    tcs_amount: number
    tds_amount: number
    commission_amount: number
    net_amount: number
    gst_rate?: number
    tcs_rate?: number
    tds_rate?: number
  } | null
  customer_details_hidden?: boolean
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
  if (order.display_id != null && String(order.display_id).trim() !== "") {
    return `#${order.display_id}`
  }
  const id = String(order.id || "")
  if (!id) return "N/A"
  if (id.length <= 18) return `#${id}`
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
  if (order.vendor_stage === "delivered" || order.customer_details_hidden) {
    return "Hidden after delivery"
  }
  const address = order.shipping_address || order.billing_address
  return `${address?.first_name || ""} ${address?.last_name || ""}`.trim() || "N/A"
}

const customerPhone = (order: VendorOrder) => {
  if (order.vendor_stage === "delivered" || order.customer_details_hidden) {
    return "—"
  }
  return String(order.shipping_address?.phone || order.billing_address?.phone || "N/A")
}

const customerEmailDisplay = (order: VendorOrder) => {
  if (order.vendor_stage === "delivered" || order.customer_details_hidden) {
    return "Hidden after delivery"
  }
  return order.email || "N/A"
}

const addressLineSafe = (order: VendorOrder, address?: Record<string, any> | null) => {
  if (order.vendor_stage === "delivered" || order.customer_details_hidden) {
    return "Hidden after delivery"
  }
  return addressLine(address)
}

const stageVariant = (stage: VendorStage) => {
  if (stage === "delivered") return "success"
  if (stage === "in_transit") return "info"
  if (stage === "to_dispatch") return "info"
  return "warning"
}

const VendorOrdersContent = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusOrderId = searchParams.get("order")
  const openedFocusOrderId = useRef<string | null>(null)
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
  const [easyShipOrder, setEasyShipOrder] = useState<VendorOrder | null>(null)
  const [easyCouriers, setEasyCouriers] = useState<
    Array<{
      courier_id: number
      courier_name: string
      rate: number | null
      freight_charge?: number | null
      etd: string | null
      rto_charges?: number | null
      cod_charges?: number | null
    }>
  >([])
  const [easyCourierLoading, setEasyCourierLoading] = useState(false)
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null)
  const [easyTracking, setEasyTracking] = useState({
    courier_partner_name: "",
    tracking_number: "",
    tracking_url: "",
  })
  const [easyPackage, setEasyPackage] = useState({
    weight: "0.5",
    length: "10",
    breadth: "10",
    height: "10",
  })
  const [easyPickupInfo, setEasyPickupInfo] = useState<{
    pickup_postcode?: string
    pickup_city?: string
    pickup_address?: string
    volumetric_weight?: number
    applied_weight?: number
    package_source?: "product" | "default" | "manual"
  }>({})
  const [selfShipping, setSelfShipping] = useState({
    courier_partner_name: "",
    tracking_source: "shiprocket" as "shiprocket" | "carrier_api" | "manual",
    awb: "",
    packing_info: "",
    tracking_url: "",
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
    return orders
      .filter((order) => {
        if (selectedStage !== "total" && order.vendor_stage !== selectedStage) return false
        if (!query) return true
        return (
          String(order.id).toLowerCase().includes(query) ||
          String(order.display_id || "").toLowerCase().includes(query) ||
          String(order.email || "").toLowerCase().includes(query) ||
          (order.product_names || []).join(" ").toLowerCase().includes(query)
        )
      })
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      )
  }, [orders, search, selectedStage])

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))
  const visibleOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openDetails = useCallback(async (order: VendorOrder, withTracking = false) => {
    setDetailOrder(order)
    setTracking(null)
    if (!withTracking) return

    setProcessing(`track:${order.id}`)
    try {
      const data = await vendorOrdersApi.track(order.id)
      replaceOrder(data.order)
      setDetailOrder(data.order)
      setTracking(data.tracking)
    } catch (e: any) {
      setTracking({ error: e?.message || "Tracking is unavailable" })
    } finally {
      setProcessing(null)
    }
  }, [replaceOrder])

  useEffect(() => {
    openedFocusOrderId.current = null
  }, [focusOrderId])

  useEffect(() => {
    if (!focusOrderId || loading || openedFocusOrderId.current === focusOrderId) return

    const focusedOrder = orders.find((order) => order.id === focusOrderId)
    if (!focusedOrder) return

    openedFocusOrderId.current = focusOrderId
    void openDetails(focusedOrder)
  }, [focusOrderId, loading, openDetails, orders])

  const acceptOrder = async (order: VendorOrder) => {
    setProcessing(`accept:${order.id}`)
    try {
      const data = await vendorOrdersApi.accept(order.id)
      replaceOrder(data.order)
      setSelectedStage("to_pack")
      setAcceptCandidate(null)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("oweg:vendor-orders-changed"))
      }
    } catch (e: any) {
      setError(e?.message || "Failed to accept order")
    } finally {
      setProcessing(null)
    }
  }

  const loadEasyCouriers = async (
    order: VendorOrder,
    pkg?: { weight: string; length: string; breadth: string; height: string } | null
  ) => {
    setEasyCourierLoading(true)
    setError(null)
    try {
      let params:
        | { weight: number; length: number; breadth: number; height: number }
        | undefined

      if (pkg) {
        const weight = Number(pkg.weight)
        const length = Number(pkg.length)
        const breadth = Number(pkg.breadth)
        const height = Number(pkg.height)
        if (![weight, length, breadth, height].every((n) => Number.isFinite(n) && n > 0)) {
          throw new Error("Enter valid weight (kg) and dimensions (cm)")
        }
        params = { weight, length, breadth, height }
      }

      const data = await vendorOrdersApi.listCouriers(order.id, params)
      setEasyCouriers(data.couriers || [])
      setEasyPackage({
        weight: String(data.weight),
        length: String(data.length),
        breadth: String(data.breadth),
        height: String(data.height),
      })
      setEasyPickupInfo({
        pickup_postcode: data.pickup_postcode,
        pickup_city: data.pickup_city,
        pickup_address: data.pickup_address,
        volumetric_weight: data.volumetric_weight,
        applied_weight: data.applied_weight,
        package_source: data.package_source,
      })
      if (data.couriers?.length) {
        setSelectedCourierId(data.couriers[0].courier_id)
      } else {
        setSelectedCourierId(null)
      }
    } catch (e: any) {
      setEasyCouriers([])
      setSelectedCourierId(null)
      setError(e?.message || "Failed to load courier partners")
      throw e
    } finally {
      setEasyCourierLoading(false)
    }
  }

  const openEasyShipping = async (order: VendorOrder) => {
    setEasyShipOrder(order)
    setEasyCouriers([])
    setSelectedCourierId(null)
    setEasyTracking({
      courier_partner_name: "",
      tracking_number: "",
      tracking_url: "",
    })
    setEasyPickupInfo({})
    setError(null)
    try {
      // No package params → backend loads weight/size from product DB
      await loadEasyCouriers(order, null)
    } catch {
      setEasyShipOrder(null)
    }
  }

  const refreshEasyCouriers = async () => {
    if (!easyShipOrder) return
    try {
      await loadEasyCouriers(easyShipOrder, easyPackage)
    } catch {
      // error already set
    }
  }

  const chooseEasyShipping = async () => {
    if (!easyShipOrder || !selectedCourierId) return
    const courier = easyCouriers.find((c) => c.courier_id === selectedCourierId)
    const weight = Number(easyPackage.weight)
    const length = Number(easyPackage.length)
    const breadth = Number(easyPackage.breadth)
    const height = Number(easyPackage.height)
    if (![weight, length, breadth, height].every((n) => Number.isFinite(n) && n > 0)) {
      setError("Enter valid weight (kg) and dimensions (cm) before booking")
      return
    }
    const courierName =
      easyTracking.courier_partner_name.trim() || courier?.courier_name || ""
    if (!courierName) {
      setError("Enter or select a courier partner name")
      return
    }
    setProcessing(`easy:${easyShipOrder.id}`)
    try {
      const data = await vendorOrdersApi.chooseEasyShipping(easyShipOrder.id, {
        courier_id: selectedCourierId,
        courier_partner_name: courierName,
        rate: courier?.rate != null ? Number(courier.rate) : undefined,
        freight_charge:
          courier?.freight_charge != null ? Number(courier.freight_charge) : undefined,
        weight,
        length,
        breadth,
        height,
        tracking_number: easyTracking.tracking_number.trim() || undefined,
        tracking_url: easyTracking.tracking_url.trim() || undefined,
      })
      replaceOrder(data.order)
      setEasyShipOrder(null)
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
        packing_info: selfShipping.packing_info.trim(),
        tracking_url: selfShipping.tracking_url.trim() || undefined,
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
      const nextStage =
        data.order?.vendor_stage === "to_dispatch" ? "to_dispatch" : "in_transit"
      setSelectedStage(nextStage)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("oweg:vendor-orders-changed"))
      }
    } catch (e: any) {
      setError(e?.message || "Failed to mark RTD")
    } finally {
      setProcessing(null)
    }
  }

  const markDispatched = async (order: VendorOrder) => {
    setProcessing(`dispatch:${order.id}`)
    try {
      const data = await vendorOrdersApi.markDispatched(order.id)
      replaceOrder(data.order)
      setSelectedStage("in_transit")
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("oweg:vendor-orders-changed"))
      }
    } catch (e: any) {
      setError(e?.message || "Failed to dispatch order")
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
      if (hasShipping) {
        const methodLabel =
          workflow.shipping_method === "easy"
            ? workflow.easy_courier_partner
              ? `Easy · ${workflow.easy_courier_partner}`
              : "Easy Shipping"
            : workflow.self_courier_partner
              ? `Self · ${workflow.self_courier_partner}`
              : "Self Shipping"

        return (
          <div className="flex min-w-[220px] flex-col gap-1.5">
            <Text size="xsmall" className="truncate text-ui-fg-subtle" title={methodLabel}>
              {methodLabel}
            </Text>
            <div className="grid grid-cols-2 gap-1.5">
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
                  disabled={busy}
                  onClick={() => void generateInvoice(order)}
                />
              )}
              <ActionButton
                icon={<Eye size={14} />}
                label="View"
                disabled={busy}
                onClick={() => void openDetails(order)}
              />
            </div>
          </div>
        )
      }

      return (
        <div className="grid min-w-[220px] grid-cols-3 gap-1.5">
          <ActionButton
            icon={<Truck size={14} />}
            label="Easy"
            disabled={busy}
            onClick={() => void openEasyShipping(order)}
          />
          <ActionButton
            icon={<PackageCheck size={14} />}
            label="Self"
            disabled={busy}
            onClick={() => {
              setSelfShipOrder(order)
              setSelfShipping({
                courier_partner_name: workflow.self_courier_partner || "",
                tracking_source: workflow.self_tracking_source || "shiprocket",
                awb: workflow.self_awb || "",
                packing_info: workflow.self_packing_info || "",
                tracking_url: workflow.tracking_url || "",
              })
            }}
          />
          <ActionButton
            icon={<FileText size={14} />}
            label="Invoice"
            disabled
            onClick={() => undefined}
          />
        </div>
      )
    }

    if (selectedStage === "to_dispatch") {
      return (
        <div className="grid min-w-[220px] grid-cols-2 gap-1.5">
          <ActionButton
            icon={<Truck size={14} />}
            label={busy ? "…" : "Dispatch"}
            disabled={busy}
            onClick={() => void markDispatched(order)}
          />
          <ActionButton
            icon={<Eye size={14} />}
            label="View"
            disabled={busy}
            onClick={() => void openDetails(order)}
          />
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

        {easyShipOrder && (
          <EasyShippingModal
            order={easyShipOrder}
            couriers={easyCouriers}
            loading={easyCourierLoading}
            selectedCourierId={selectedCourierId}
            busy={processing === `easy:${easyShipOrder.id}`}
            pkg={easyPackage}
            pickupInfo={easyPickupInfo}
            tracking={easyTracking}
            onPackageChange={setEasyPackage}
            onTrackingChange={setEasyTracking}
            onRefreshRates={() => void refreshEasyCouriers()}
            onSelect={(id) => {
              setSelectedCourierId(id)
              const courier = easyCouriers.find((c) => c.courier_id === id)
              if (courier?.courier_name) {
                setEasyTracking((prev) => ({
                  ...prev,
                  courier_partner_name: courier.courier_name,
                }))
              }
            }}
            onClose={() => setEasyShipOrder(null)}
            onSubmit={() => void chooseEasyShipping()}
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
        title={clickable ? "Open order details" : `#${order.display_id || order.id}`}
        className={clx(
          "min-w-0 truncate rounded-md px-0.5 py-1 text-left text-sm font-semibold text-ui-fg-base",
          clickable && "hover:text-oweg-700 focus:outline-none focus:ring-2 focus:ring-oweg-500/20"
        )}
      >
        {idText}
      </button>
      <button
        type="button"
        title={`Copy full id (${order.id})`}
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
            <Text size="small" className="text-ui-fg-subtle">
              {customerEmailDisplay(order)}
            </Text>
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
              [
                "Taxable",
                formatCurrency(
                  Number(order.settlement?.taxable_amount ?? order.taxable_amount ?? 0),
                  order.currency_code || "INR"
                ),
              ],
              [
                "GST",
                formatCurrency(
                  Number(order.settlement?.gst_amount ?? order.gst_amount ?? 0),
                  order.currency_code || "INR"
                ),
              ],
              [
                "TCS",
                formatCurrency(
                  Number(order.settlement?.tcs_amount ?? order.tcs_amount ?? 0),
                  order.currency_code || "INR"
                ),
              ],
              [
                "TDS",
                formatCurrency(
                  Number(order.settlement?.tds_amount ?? order.tds_amount ?? 0),
                  order.currency_code || "INR"
                ),
              ],
            ]}
          />
          <InfoBlock
            title="Customer Details"
            rows={[
              ["Full name", customerName(order)],
              ["Contact number", customerPhone(order)],
              ["Email ID", customerEmailDisplay(order)],
              ["Billing address", addressLineSafe(order, order.billing_address)],
              ["Shipping address", addressLineSafe(order, order.shipping_address)],
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
            [
              "Booked through",
              workflow.shipping_method === "easy"
                ? "Shiprocket"
                : workflow.self_tracking_source === "shiprocket"
                  ? "Shiprocket"
                  : workflow.self_tracking_source === "carrier_api"
                    ? "Carrier API"
                    : workflow.shipping_method === "self"
                      ? "Manual"
                      : "N/A",
            ],
            [
              "Courier",
              workflow.easy_courier_partner ||
                workflow.self_courier_partner ||
                (workflow.shipping_method === "easy" ? "Shiprocket" : "N/A"),
            ],
            [
              "AWB / Tracking",
              workflow.tracking_number ||
                workflow.shiprocket_awb ||
                workflow.self_awb ||
                (workflow.shipping_method === "easy" ? "Pending from Shiprocket" : "N/A"),
            ],
            ["Tracking URL", workflow.tracking_url || "N/A"],
            ...(workflow.shipping_method === "easy"
              ? [
                  ["Shiprocket order", workflow.shiprocket_order_id ? String(workflow.shiprocket_order_id) : "N/A"] as [string, string],
                  ["Shiprocket shipment", workflow.shiprocket_shipment_id ? String(workflow.shiprocket_shipment_id) : "N/A"] as [string, string],
                ]
              : [["Packing", workflow.self_packing_info || "N/A"] as [string, string]]),
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
              ? tracking?.awb
                ? "Live status fetched from the configured tracking provider."
                : "Shipment created — waiting for AWB / tracking number from the courier."
              : "Self-shipping tracking needs a configured carrier API for live checkpoints (or use a tracking URL)."}
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

function EasyShippingModal({
  order,
  couriers,
  loading,
  selectedCourierId,
  busy,
  pkg,
  pickupInfo,
  tracking,
  onPackageChange,
  onTrackingChange,
  onRefreshRates,
  onSelect,
  onClose,
  onSubmit,
}: {
  order: VendorOrder
  couriers: Array<{
    courier_id: number
    courier_name: string
    rate: number | null
    etd: string | null
    rto_charges?: number | null
    cod_charges?: number | null
  }>
  loading: boolean
  selectedCourierId: number | null
  busy: boolean
  pkg: { weight: string; length: string; breadth: string; height: string }
  pickupInfo: {
    pickup_postcode?: string
    pickup_city?: string
    pickup_address?: string
    volumetric_weight?: number
    applied_weight?: number
    package_source?: "product" | "default" | "manual"
  }
  tracking: {
    courier_partner_name: string
    tracking_number: string
    tracking_url: string
  }
  onPackageChange: (next: { weight: string; length: string; breadth: string; height: string }) => void
  onTrackingChange: (next: {
    courier_partner_name: string
    tracking_number: string
    tracking_url: string
  }) => void
  onRefreshRates: () => void
  onSelect: (id: number) => void
  onClose: () => void
  onSubmit: () => void
}) {
  const setField = (key: keyof typeof pkg, value: string) =>
    onPackageChange({ ...pkg, [key]: value })
  const setTrackingField = (key: keyof typeof tracking, value: string) =>
    onTrackingChange({ ...tracking, [key]: value })

  const pickupLabel = [
    pickupInfo.pickup_address,
    pickupInfo.pickup_city,
    pickupInfo.pickup_postcode,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-ui-border-base bg-ui-bg-base shadow-xl">
        <div className="border-b border-ui-border-base px-5 py-4">
          <Heading level="h2" className="text-xl">Book Easy Shipping</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {compactOrderId(order)} · courier, tracking number, and links
          </Text>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-lg border border-ui-border-base/70 bg-ui-bg-subtle/30 p-3">
            <Text size="xsmall" className="text-ui-fg-subtle">Pickup warehouse</Text>
            <Text size="small" weight="plus" className="mt-0.5">
              {pickupLabel || "Your store address"}
            </Text>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Text size="small" weight="plus">Package details</Text>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {pickupInfo.package_source === "product"
                  ? "From product catalog"
                  : pickupInfo.package_source === "manual"
                    ? "Manual override"
                    : "Default values"}
              </Text>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Weight (kg)"
                type="number"
                value={pkg.weight}
                onChange={(value) => setField("weight", value)}
              />
              <Field
                label="Length (cm)"
                type="number"
                value={pkg.length}
                onChange={(value) => setField("length", value)}
              />
              <Field
                label="Breadth (cm)"
                type="number"
                value={pkg.breadth}
                onChange={(value) => setField("breadth", value)}
              />
              <Field
                label="Height (cm)"
                type="number"
                value={pkg.height}
                onChange={(value) => setField("height", value)}
              />
            </div>
            {(pickupInfo.volumetric_weight != null || pickupInfo.applied_weight != null) && (
              <Text size="xsmall" className="text-ui-fg-subtle">
                Volumetric {pickupInfo.volumetric_weight ?? "—"} kg · Applied{" "}
                {pickupInfo.applied_weight ?? "—"} kg
              </Text>
            )}
            <Button
              variant="secondary"
              size="small"
              onClick={onRefreshRates}
              disabled={busy || loading}
            >
              {loading ? "Getting rates…" : "Get exact rates"}
            </Button>
          </div>

          <div className="space-y-2">
            <Text size="small" weight="plus">Available courier services</Text>
            {loading ? (
              <Text size="small" className="text-ui-fg-subtle">Loading couriers…</Text>
            ) : couriers.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No courier partners for this package / pincode. Adjust weight or size and refresh.
              </Text>
            ) : (
              <ul className="space-y-2">
                {couriers.map((courier) => {
                  const selected = selectedCourierId === courier.courier_id
                  return (
                    <li key={courier.courier_id}>
                      <button
                        type="button"
                        onClick={() => onSelect(courier.courier_id)}
                        className={clx(
                          "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition",
                          selected
                            ? "border-ui-fg-interactive bg-ui-bg-interactive/10"
                            : "border-ui-border-base/70 hover:border-ui-border-strong"
                        )}
                      >
                        <div>
                          <Text weight="plus" size="small">{courier.courier_name}</Text>
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {courier.etd ? `ETA ${courier.etd}` : "ETA n/a"}
                            {courier.cod_charges != null && Number(courier.cod_charges) > 0
                              ? ` · COD fee ${formatCurrency(
                                  Number(courier.cod_charges),
                                  order.currency_code || "INR"
                                )}`
                              : ""}
                          </Text>
                        </div>
                        <div className="shrink-0 text-right">
                          <Text weight="plus" size="small">
                            {courier.rate != null
                              ? formatCurrency(Number(courier.rate), order.currency_code || "INR")
                              : "—"}
                          </Text>
                          <Text size="xsmall" className="block text-ui-fg-subtle">
                            {courier.rto_charges != null
                              ? `RTO ${formatCurrency(
                                  Number(courier.rto_charges),
                                  order.currency_code || "INR"
                                )}`
                              : "RTO n/a"}
                          </Text>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-ui-border-base/70 p-3">
            <div>
              <Text size="small" weight="plus">Courier & tracking links</Text>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Add courier name, tracking number, and optional tracking URL
              </Text>
            </div>
            <Field
              label="Courier name"
              value={tracking.courier_partner_name}
              placeholder="e.g. Delhivery, BlueDart"
              onChange={(value) => setTrackingField("courier_partner_name", value)}
            />
            <Field
              label="Tracking number"
              value={tracking.tracking_number}
              placeholder="123-456-789 (optional — AWB filled after booking)"
              onChange={(value) => setTrackingField("tracking_number", value)}
            />
            <Field
              label="Tracking URL"
              value={tracking.tracking_url}
              placeholder="https://example.com/tracking/123"
              onChange={(value) => setTrackingField("tracking_url", value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-ui-border-base px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={onSubmit}
            disabled={
              busy ||
              loading ||
              !selectedCourierId ||
              couriers.length === 0 ||
              !tracking.courier_partner_name.trim()
            }
          >
            {busy ? "Booking…" : "Create shipment & AWB"}
          </Button>
        </div>
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
    packing_info: string
    tracking_url: string
  }
  busy: boolean
  onChange: (next: {
    courier_partner_name: string
    tracking_source: "shiprocket" | "carrier_api" | "manual"
    awb: string
    packing_info: string
    tracking_url: string
  }) => void
  onClose: () => void
  onSubmit: () => void
}) {
  const setField = (key: keyof typeof form, value: string) => onChange({ ...form, [key]: value })
  const complete =
    form.courier_partner_name.trim() &&
    form.awb.trim() &&
    form.packing_info.trim() &&
    (form.tracking_source !== "manual" || form.tracking_url.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-ui-border-base bg-ui-bg-base shadow-xl">
        <div className="border-b border-ui-border-base px-5 py-4">
          <Heading level="h2" className="text-xl">Self Shipping</Heading>
          <Text size="small" className="text-ui-fg-subtle">{compactOrderId(order)}</Text>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <Field
            label="Courier partner name"
            value={form.courier_partner_name}
            placeholder="e.g. India Post"
            onChange={(value) => setField("courier_partner_name", value)}
          />
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
          <Field
            label="AWB / Tracking ID"
            value={form.awb}
            placeholder="123-456-789"
            onChange={(value) => setField("awb", value)}
          />
          <Field
            label="Tracking URL"
            value={form.tracking_url}
            placeholder="https://example.com/tracking/123"
            onChange={(value) => setField("tracking_url", value)}
          />
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
  placeholder,
  onChange,
}: {
  label: string
  value: string
  type?: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <Text size="small" weight="plus" className="mb-1.5">{label}</Text>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base px-3 text-sm outline-none placeholder:text-ui-fg-muted focus:border-ui-border-strong"
      />
    </label>
  )
}

const VendorOrdersPage = () => (
  <Suspense fallback={<VendorShell><PageSkeleton label="Loading orders..." stats={6} rows={8} cols={6} showAction /></VendorShell>}>
    <VendorOrdersContent />
  </Suspense>
)

export default VendorOrdersPage
