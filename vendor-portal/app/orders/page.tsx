"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
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
  Package,
  PackageCheck,
  RefreshCw,
  Search,
  Truck,
} from "lucide-react"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import PageHeader from "@/components/PageHeader"
import EmptyState from "@/components/EmptyState"
import StatusDot from "@/components/dashboard/StatusDot"
import { vendorOrdersApi } from "@/lib/api/client"
import { notifyVendorDataChanged, useVendorLive } from "@/lib/useVendorLive"
import { hasPageCache, pageCacheKey, peekPageCache, writePageCache } from "@/lib/page-cache"
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
  self_delivery_confirmation?: string | null
  self_delivered_at?: string | null
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
  tone: string
  iconTone: string
}> = [
  {
    key: "total",
    label: "Total orders",
    subtext: "All received",
    icon: <Clipboard size={18} />,
    tone: "border-ui-border-base/70",
    iconTone: "bg-ui-bg-subtle text-ui-fg-subtle",
  },
  {
    key: "to_accept",
    label: "To Accept",
    subtext: "Confirm first",
    icon: <CheckCircle2 size={18} />,
    tone: "border-amber-500/30",
    iconTone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  {
    key: "to_pack",
    label: "To Pack",
    subtext: "Ship + invoice",
    icon: <Package size={18} />,
    tone: "border-sky-500/30",
    iconTone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  {
    key: "to_dispatch",
    label: "To Dispatch",
    subtext: "Ready to move",
    icon: <PackageCheck size={18} />,
    tone: "border-violet-500/30",
    iconTone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  {
    key: "in_transit",
    label: "In Transit",
    subtext: "On the way",
    icon: <Truck size={18} />,
    tone: "border-blue-500/30",
    iconTone: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  {
    key: "delivered",
    label: "Delivered",
    subtext: "Completed",
    icon: <CheckCircle2 size={18} />,
    tone: "border-oweg-500/30",
    iconTone: "bg-oweg-500/10 text-oweg-700 dark:text-oweg-300",
  },
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

const stagePillClass = (stage: VendorStage) => {
  switch (stage) {
    case "delivered":
      return "bg-oweg-500/10 text-oweg-800 ring-oweg-500/20 dark:text-oweg-300"
    case "in_transit":
      return "bg-blue-500/10 text-blue-800 ring-blue-500/20 dark:text-blue-300"
    case "to_dispatch":
      return "bg-violet-500/10 text-violet-800 ring-violet-500/20 dark:text-violet-300"
    case "to_pack":
      return "bg-sky-500/10 text-sky-800 ring-sky-500/20 dark:text-sky-300"
    case "to_accept":
    default:
      return "bg-amber-500/10 text-amber-900 ring-amber-500/25 dark:text-amber-300"
  }
}

const VendorOrdersContent = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusOrderId = searchParams.get("order")
  const stageFromUrl = searchParams.get("stage")
  const openedFocusOrderId = useRef<string | null>(null)
  const [selectedStage, setSelectedStage] = useState<StageFilter>(() => {
    const valid = stageConfig.some((item) => item.key === stageFromUrl)
    return valid ? (stageFromUrl as StageFilter) : "total"
  })
  const [search, setSearch] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [page, setPage] = useState(1)

  type OrdersCachePayload = {
    orders: VendorOrder[]
    stageCounts: Record<StageFilter, number>
    totalFiltered: number
  }

  const ordersCacheKey = pageCacheKey("orders", {
    stage: selectedStage,
    page,
    q: searchDebounced || undefined,
  })
  const cachedOrders = peekPageCache<OrdersCachePayload>(ordersCacheKey)

  const [orders, setOrders] = useState<VendorOrder[]>(() => cachedOrders?.orders ?? [])
  const [stageCounts, setStageCounts] = useState<Record<StageFilter, number>>(
    () =>
      cachedOrders?.stageCounts ?? {
        total: 0,
        to_accept: 0,
        to_pack: 0,
        to_dispatch: 0,
        in_transit: 0,
        delivered: 0,
      }
  )
  const [totalFiltered, setTotalFiltered] = useState(() => cachedOrders?.totalFiltered ?? 0)
  const [loading, setLoading] = useState(() => !hasPageCache(ordersCacheKey))
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  useEffect(() => {
    const id = window.setTimeout(() => setSearchDebounced(search.trim()), 300)
    return () => window.clearTimeout(id)
  }, [search])

  const loadOrders = useCallback(async () => {
    const cacheKey = pageCacheKey("orders", {
      stage: selectedStage,
      page,
      q: searchDebounced || undefined,
    })
    const cached = peekPageCache<OrdersCachePayload>(cacheKey)
    if (cached) {
      setOrders(cached.orders)
      setStageCounts(cached.stageCounts)
      setTotalFiltered(cached.totalFiltered)
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
      const data = await vendorOrdersApi.list({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        stage: selectedStage === "total" ? undefined : selectedStage,
        q: searchDebounced || undefined,
      })
      const nextOrders = data?.orders || []
      const nextCounts = data?.counts
        ? {
            total: Number(data.counts.total) || 0,
            to_accept: Number(data.counts.to_accept) || 0,
            to_pack: Number(data.counts.to_pack) || 0,
            to_dispatch: Number(data.counts.to_dispatch) || 0,
            in_transit: Number(data.counts.in_transit) || 0,
            delivered: Number(data.counts.delivered) || 0,
          }
        : {
            total: 0,
            to_accept: 0,
            to_pack: 0,
            to_dispatch: 0,
            in_transit: 0,
            delivered: 0,
          }
      const nextTotal =
        typeof data?.count === "number" ? data.count : nextOrders.length

      setOrders(nextOrders)
      setStageCounts(nextCounts)
      setTotalFiltered(nextTotal)
      writePageCache(cacheKey, {
        orders: nextOrders,
        stageCounts: nextCounts,
        totalFiltered: nextTotal,
      } satisfies OrdersCachePayload)
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
  }, [router, page, selectedStage, searchDebounced])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadOrders()
    } finally {
      setRefreshing(false)
    }
  }, [loadOrders])

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      router.push("/login")
      return
    }
    void loadOrders()
  }, [router, loadOrders])

  useVendorLive({
    onInvalidate: () => {
      void loadOrders()
    },
  })

  useEffect(() => {
    setPage(1)
  }, [selectedStage, searchDebounced])

  useEffect(() => {
    const stageParam = searchParams.get("stage")
    if (!stageParam) return
    if (!stageConfig.some((item) => item.key === stageParam)) return
    setSelectedStage(stageParam as StageFilter)
  }, [searchParams])

  const counts = stageCounts
  const pageCount = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE))
  const visibleOrders = orders

  const openDetails = useCallback(async (order: VendorOrder, withTracking = false) => {
    setDetailOrder(order)
    setTracking(null)
    setProcessing(`detail:${order.id}`)

    const mergeSettlement = (prev: VendorOrder, next: VendorOrder): VendorOrder => {
      const prevTaxable = Number(prev.settlement?.taxable_amount ?? prev.taxable_amount ?? 0)
      const nextTaxable = Number(next.settlement?.taxable_amount ?? next.taxable_amount ?? 0)
      const prevGst = Number(prev.settlement?.gst_amount ?? prev.gst_amount ?? 0)
      const nextGst = Number(next.settlement?.gst_amount ?? next.gst_amount ?? 0)
      // Don't let a weak detail/track payload wipe a good settlement already on screen
      if ((prevTaxable > 0 || prevGst > 0) && nextTaxable <= 0 && nextGst <= 0) {
        return {
          ...next,
          settlement: prev.settlement ?? next.settlement,
          taxable_amount: prev.taxable_amount ?? next.taxable_amount,
          gst_amount: prev.gst_amount ?? next.gst_amount,
          tcs_amount: prev.tcs_amount ?? next.tcs_amount,
          tds_amount: prev.tds_amount ?? next.tds_amount,
          commission_amount: prev.commission_amount ?? next.commission_amount,
        }
      }
      return next
    }

    try {
      // Always refetch detail so GST / settlement use product tax metadata
      const data = await vendorOrdersApi.get(order.id)
      const nextOrder = mergeSettlement(order, (data?.order || order) as VendorOrder)
      replaceOrder(nextOrder)
      setDetailOrder(nextOrder)

      if (withTracking) {
        setProcessing(`track:${order.id}`)
        try {
          const trackData = await vendorOrdersApi.track(order.id)
          const tracked = mergeSettlement(nextOrder, trackData.order as VendorOrder)
          replaceOrder(tracked)
          setDetailOrder(tracked)
          setTracking(trackData.tracking)
        } catch (e: any) {
          setTracking({ error: e?.message || "Tracking is unavailable" })
        }
      }
    } catch (e: any) {
      // Keep list payload if detail fetch fails
      console.warn("Failed to refresh order detail:", e?.message || e)
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
      notifyVendorDataChanged()
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
    const courierName = courier?.courier_name?.trim() || ""
    if (!courierName) {
      setError("Select a Shiprocket courier to continue")
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
      })
      replaceOrder(data.order)
      setEasyShipOrder(null)
      notifyVendorDataChanged()
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
      notifyVendorDataChanged()
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
      // Amazon-style confirm shipment → In Transit immediately (self + easy)
      setSelectedStage(data.order?.vendor_stage === "delivered" ? "delivered" : "in_transit")
      notifyVendorDataChanged()
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
      notifyVendorDataChanged()
    } catch (e: any) {
      setError(e?.message || "Failed to dispatch order")
    } finally {
      setProcessing(null)
    }
  }

  const markDelivered = async (order: VendorOrder) => {
    const confirmation = window.prompt(
      "Optional: enter courier POD / delivery reference / OTP note (or leave blank)",
      ""
    )
    if (confirmation === null) return

    setProcessing(`delivered:${order.id}`)
    try {
      const data = await vendorOrdersApi.markDelivered(order.id, {
        delivery_confirmation: confirmation.trim() || undefined,
      })
      replaceOrder(data.order)
      setSelectedStage("delivered")
      notifyVendorDataChanged()
    } catch (e: any) {
      setError(e?.message || "Failed to mark order delivered")
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
      // Legacy self-ship parked here before Amazon-style RTD; Dispatch still advances them.
      return (
        <div className="grid min-w-[220px] grid-cols-2 gap-1.5">
          <ActionButton
            icon={<Truck size={14} />}
            label={busy ? "…" : "Confirm ship"}
            disabled={busy}
            onClick={() => void markDispatched(order)}
          />
          <ActionButton
            icon={<Eye size={14} />}
            label="Track"
            disabled={busy}
            onClick={() => void openDetails(order, true)}
          />
        </div>
      )
    }

    const isSelfShip = workflow.shipping_method === "self"
    const showDelivered =
      isSelfShip &&
      (selectedStage === "in_transit" || order.vendor_stage === "in_transit") &&
      order.vendor_stage !== "delivered"

    if (showDelivered) {
      return (
        <div className="grid min-w-[220px] grid-cols-2 gap-1.5">
          <ActionButton
            icon={<CheckCircle2 size={14} />}
            label={busy ? "…" : "Delivered"}
            disabled={busy}
            onClick={() => void markDelivered(order)}
          />
          <ActionButton
            icon={<Truck size={14} />}
            label="Track"
            disabled={busy}
            onClick={() => void openDetails(order, true)}
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

  if (loading && orders.length === 0) {
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
    const attentionCount = counts.to_accept
    content = (
      <Container className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <PageHeader
          title="Orders"
          description="Accept, pack, dispatch, and track customer orders for your catalog."
          actions={
            <Button
              variant="secondary"
              disabled={refreshing || loading}
              className="transition-transform active:scale-[0.98]"
              onClick={() => void handleRefresh()}
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </Button>
          }
        />

        {error && (
          <div className="animate-fade-in-up rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
            <Text size="small" className="text-ui-fg-error">
              {error}
            </Text>
          </div>
        )}

        {counts.total === 0 && orders.length === 0 ? (
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
            {attentionCount > 0 && selectedStage !== "to_accept" ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedStage("to_accept")
                  setPage(1)
                  const params = new URLSearchParams(searchParams.toString())
                  params.set("stage", "to_accept")
                  router.replace(`/orders?${params.toString()}`)
                }}
                className="animate-fade-in-up group flex w-full items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-gradient-to-r from-amber-500/[0.08] to-transparent px-4 py-3 text-left transition-all duration-300 hover:border-amber-500/40 hover:shadow-sm"
              >
                <div className="min-w-0">
                  <Text weight="plus" size="small" className="text-amber-900 dark:text-amber-200">
                    {attentionCount} order{attentionCount === 1 ? "" : "s"} waiting to accept
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Confirm soon so packing can start
                  </Text>
                </div>
                <span className="shrink-0 rounded-lg border border-amber-500/30 bg-ui-bg-base px-3 py-1.5 text-xs font-medium text-amber-800 transition group-hover:bg-amber-500/10 dark:text-amber-200">
                  Review
                </span>
              </button>
            ) : null}

            <div
              className="oweg-stagger grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6"
              style={{ animationDelay: "40ms" }}
            >
              {stageConfig.map((item) => {
                const active = selectedStage === item.key
                const count = counts[item.key]
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setSelectedStage(item.key)
                      setPage(1)
                      const params = new URLSearchParams(searchParams.toString())
                      if (item.key === "total") {
                        params.delete("stage")
                      } else {
                        params.set("stage", item.key)
                      }
                      const qs = params.toString()
                      router.replace(qs ? `/orders?${qs}` : "/orders")
                    }}
                    className={clx(
                      "rounded-xl border bg-ui-bg-base p-4 text-left transition-all duration-300 ease-out",
                      "hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]",
                      active
                        ? "border-oweg-500/50 shadow-sm ring-2 ring-oweg-500/15"
                        : item.tone
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span
                        className={clx(
                          "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                          item.iconTone
                        )}
                      >
                        {item.icon}
                      </span>
                      <Text className="text-2xl font-semibold tabular-nums tracking-tight">
                        {count}
                      </Text>
                    </div>
                    <Text weight="plus" className="text-sm">
                      {item.label}
                    </Text>
                    <Text size="small" className="mt-0.5 text-ui-fg-subtle">
                      {item.subtext}
                    </Text>
                  </button>
                )
              })}
            </div>

            <section
              className="animate-fade-in-up-slow space-y-3"
              style={{ animationDelay: "120ms" }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Heading level="h2" className="text-lg tracking-tight">
                      Order summary
                    </Heading>
                    {selectedStage !== "total" ? (
                      <span className="rounded-full bg-ui-bg-subtle px-2 py-0.5 text-xs text-ui-fg-subtle ring-1 ring-ui-border-base/70">
                        {stageConfig.find((s) => s.key === selectedStage)?.label}
                      </span>
                    ) : null}
                  </div>
                  <Text size="small" className="mt-0.5 text-ui-fg-subtle">
                    {totalFiltered} order{totalFiltered === 1 ? "" : "s"} in this view
                  </Text>
                </div>
                <div className="relative w-full sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-fg-muted" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setPage(1)
                    }}
                    placeholder="Search order, customer, product..."
                    className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base pl-9 pr-3 text-sm outline-none transition-all duration-200 placeholder:text-ui-fg-muted focus:border-oweg-500/40 focus:ring-2 focus:ring-oweg-500/10"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base shadow-sm shadow-oweg-500/[0.03]">
                <div className="sticky top-0 z-10 hidden border-b border-ui-border-base/70 bg-ui-bg-subtle/80 px-4 py-3 backdrop-blur-sm md:grid md:grid-cols-[100px_120px_minmax(0,1.3fr)_110px_100px_130px_150px] md:gap-3">
                  {["Date", "Order", "Product", "Amount", "Payment", "Status", "Action"].map(
                    (heading) => (
                      <Text
                        key={heading}
                        size="small"
                        weight="plus"
                        className="text-[11px] uppercase tracking-wide text-ui-fg-muted"
                      >
                        {heading}
                      </Text>
                    )
                  )}
                </div>

                {visibleOrders.length === 0 ? (
                  <div className="flex flex-col items-center px-6 py-14 text-center">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ui-bg-subtle text-ui-fg-muted ring-1 ring-ui-border-base">
                      <Search size={20} />
                    </div>
                    <Text weight="plus" className="text-ui-fg-base">
                      No orders match
                    </Text>
                    <Text size="small" className="mt-1 max-w-sm text-ui-fg-subtle">
                      Try another stage filter or clear the search to see all orders again.
                    </Text>
                    <Button
                      variant="secondary"
                      className="mt-4"
                      onClick={() => {
                        setSearch("")
                        setSelectedStage("total")
                        setPage(1)
                        const params = new URLSearchParams(searchParams.toString())
                        params.delete("stage")
                        const qs = params.toString()
                        router.replace(qs ? `/orders?${qs}` : "/orders")
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-ui-border-base/60">
                    {visibleOrders.map((order) => {
                      const products =
                        order.product_names ||
                        order.items?.map((item) => item.title) ||
                        []
                      const productLabel = products.join(", ") || "N/A"
                      const itemCount =
                        order.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) ||
                        products.length ||
                        0

                      return (
                        <div
                          key={order.id}
                          className="group grid grid-cols-1 gap-3 px-4 py-3.5 transition-all duration-200 hover:bg-ui-bg-subtle/70 md:grid-cols-[100px_120px_minmax(0,1.3fr)_110px_100px_130px_150px] md:items-center md:gap-3"
                        >
                          <div>
                            <Text size="xsmall" className="mb-0.5 text-ui-fg-muted md:hidden">
                              Date
                            </Text>
                            <Text size="small" className="tabular-nums text-ui-fg-subtle">
                              {formatDate(order.created_at)}
                            </Text>
                          </div>

                          <div>
                            <Text size="xsmall" className="mb-0.5 text-ui-fg-muted md:hidden">
                              Order
                            </Text>
                            <OrderIdCell
                              order={order}
                              clickable
                              onOpen={() => void openDetails(order)}
                            />
                          </div>

                          <div className="min-w-0">
                            <Text size="xsmall" className="mb-0.5 text-ui-fg-muted md:hidden">
                              Product
                            </Text>
                            <Text
                              size="small"
                              weight="plus"
                              className="truncate"
                              title={productLabel}
                            >
                              {productLabel}
                            </Text>
                            <Text size="xsmall" className="mt-0.5 text-ui-fg-muted">
                              {itemCount} item{itemCount === 1 ? "" : "s"}
                              {customerName(order) !== "N/A" &&
                              customerName(order) !== "Hidden after delivery"
                                ? ` · ${customerName(order)}`
                                : ""}
                            </Text>
                          </div>

                          <div>
                            <Text size="xsmall" className="mb-0.5 text-ui-fg-muted md:hidden">
                              Amount
                            </Text>
                            <Text size="small" weight="plus" className="tabular-nums">
                              {formatCurrency(order.total, order.currency_code || "INR")}
                            </Text>
                          </div>

                          <div>
                            <Text size="xsmall" className="mb-0.5 text-ui-fg-muted md:hidden">
                              Payment
                            </Text>
                            <PaymentBadge type={order.payment_type || "Prepaid"} />
                          </div>

                          <div>
                            <Text size="xsmall" className="mb-0.5 text-ui-fg-muted md:hidden">
                              Status
                            </Text>
                            <span
                              className={clx(
                                "inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset",
                                stagePillClass(order.vendor_stage)
                              )}
                              title={order.vendor_status_label}
                            >
                              {order.vendor_status_label}
                            </span>
                          </div>

                          <div>{renderAction(order)}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 text-ui-fg-muted sm:flex-row sm:items-center sm:justify-between">
                <Text size="small" className="tabular-nums">
                  Showing {visibleOrders.length ? (page - 1) * PAGE_SIZE + 1 : 0}–
                  {Math.min(page * PAGE_SIZE, totalFiltered)} of {totalFiltered}
                </Text>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 bg-ui-bg-base transition hover:border-ui-border-strong hover:bg-ui-bg-subtle disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <Text size="small" className="min-w-[5.5rem] text-center tabular-nums">
                    Page {page} of {pageCount}
                  </Text>
                  <button
                    type="button"
                    disabled={page >= pageCount}
                    onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 bg-ui-bg-base transition hover:border-ui-border-strong hover:bg-ui-bg-subtle disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </section>
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
            onPackageChange={setEasyPackage}
            onRefreshRates={() => void refreshEasyCouriers()}
            onSelect={setSelectedCourierId}
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
          "min-w-0 truncate rounded-md px-0.5 py-1 text-left text-sm font-semibold tabular-nums text-ui-fg-base transition-colors",
          clickable &&
            "hover:text-oweg-700 focus:outline-none focus:ring-2 focus:ring-oweg-500/20 dark:hover:text-oweg-300"
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

function PaymentBadge({ type }: { type: string }) {
  const prepaid = type.toLowerCase().includes("pre")
  return (
    <span
      className={clx(
        "inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        prepaid
          ? "bg-oweg-500/10 text-oweg-800 ring-oweg-500/20 dark:text-oweg-300"
          : "bg-ui-bg-subtle text-ui-fg-subtle ring-ui-border-base"
      )}
    >
      {type}
    </span>
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
        "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-all duration-200 active:scale-[0.98]",
        active
          ? "border-oweg-500/40 bg-oweg-500/10 text-oweg-800 shadow-sm dark:text-oweg-300"
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

function orderProgressSteps(stage: VendorStage) {
  const steps: Array<{ key: VendorStage | "placed"; label: string }> = [
    { key: "placed", label: "Placed" },
    { key: "to_accept", label: "Accept" },
    { key: "to_pack", label: "Pack / ship" },
    { key: "to_dispatch", label: "Dispatch" },
    { key: "in_transit", label: "In transit" },
    { key: "delivered", label: "Delivered" },
  ]
  const orderIndex: Record<string, number> = {
    placed: 0,
    to_accept: 1,
    to_pack: 2,
    to_dispatch: 3,
    in_transit: 4,
    delivered: 5,
  }
  const current = orderIndex[stage] ?? 1
  return steps.map((step, index) => ({
    ...step,
    state: index < current ? "done" : index === current ? "current" : "todo",
  }))
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
  const currency = order.currency_code || "INR"
  const settlement = order.settlement
  const itemTotal = Number(order.total) || 0
  const taxable = Number(settlement?.taxable_amount ?? order.taxable_amount ?? 0)
  const gst = Number(settlement?.gst_amount ?? order.gst_amount ?? 0)
  const gstRate = Number(settlement?.gst_rate ?? 0)
  const commission = Number(settlement?.commission_amount ?? order.commission_amount ?? 0)
  const tcs = Number(settlement?.tcs_amount ?? order.tcs_amount ?? 0)
  const tds = Number(settlement?.tds_amount ?? order.tds_amount ?? 0)
  const payout = Number(
    settlement?.net_amount ??
      Math.max(0, taxable - commission - tcs - tds)
  )
  const progress = orderProgressSteps(order.vendor_stage)
  const timelineSource: Array<[string, string]> = [
    ["Order placed", order.created_at],
    ["Accepted", workflow.accepted_at || ""],
    ["Shipping selected", workflow.shipping_method || ""],
    ["Invoice generated", workflow.invoice_generated_at || ""],
    ["Ready to dispatch", workflow.rtd_at || ""],
    ["Current status", order.vendor_status_label],
  ]
  const timeline = timelineSource.filter(([, value]) => Boolean(value))
  const stageBadge =
    order.vendor_stage === "to_accept"
      ? { label: "Need vendor acceptance", className: "bg-amber-100 text-amber-900 border-amber-200" }
      : order.vendor_stage === "delivered"
        ? { label: "Delivered", className: "bg-emerald-100 text-emerald-900 border-emerald-200" }
        : { label: order.vendor_status_label || order.vendor_stage, className: "bg-ui-bg-subtle text-ui-fg-base border-ui-border-base" }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-ui-border-base bg-ui-bg-base shadow-xl">
        <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 border-b border-ui-border-base bg-ui-bg-base/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Heading level="h2" className="text-xl md:text-2xl">
                Order {compactOrderId(order)}
              </Heading>
              <span className={clx("rounded-full border px-2.5 py-0.5 text-xs font-medium", stageBadge.className)}>
                {stageBadge.label}
              </span>
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {formatDate(order.created_at)} · {order.payment_type || "Prepaid"} · {customerEmailDisplay(order)}
            </Text>
          </div>
          <Button variant="secondary" size="small" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-xl border border-ui-border-base/70 bg-ui-bg-subtle/20 p-4">
            <Text weight="plus" className="mb-3 text-sm">
              Order progress
            </Text>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {progress.map((step) => (
                <div
                  key={step.key}
                  className={clx(
                    "rounded-lg border px-2.5 py-2",
                    step.state === "done" && "border-emerald-500/30 bg-emerald-500/10",
                    step.state === "current" && "border-amber-500/40 bg-amber-500/10",
                    step.state === "todo" && "border-ui-border-base/60 bg-ui-bg-base"
                  )}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <span
                      className={clx(
                        "h-2 w-2 rounded-full",
                        step.state === "done" && "bg-emerald-500",
                        step.state === "current" && "bg-amber-500",
                        step.state === "todo" && "bg-ui-fg-muted/40"
                      )}
                    />
                    <Text size="xsmall" className="text-ui-fg-muted uppercase tracking-wide">
                      {step.state === "done" ? "Done" : step.state === "current" ? "Now" : "Next"}
                    </Text>
                  </div>
                  <Text size="small" weight="plus">
                    {step.label}
                  </Text>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div className="space-y-5">
              <div className="rounded-xl border border-ui-border-base/70 bg-ui-bg-base p-4">
                <Text weight="plus" className="mb-3">
                  Order items
                </Text>
                <div className="overflow-hidden rounded-lg border border-ui-border-base/70">
                  {(order.items || []).map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-ui-border-base/70 px-3 py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <Text size="small" weight="plus" className="truncate">
                          {item.title}
                        </Text>
                        <Text size="xsmall" className="mt-0.5 text-ui-fg-subtle">
                          {[item.variant_title, `Qty ${item.quantity}`].filter(Boolean).join(" · ")}
                        </Text>
                      </div>
                      <Text size="small" weight="plus" className="whitespace-nowrap">
                        {formatCurrency(Number(item.unit_price || 0) * Number(item.quantity || 1), currency)}
                      </Text>
                    </div>
                  ))}
                  {!(order.items || []).length && (
                    <div className="px-3 py-4">
                      <Text size="small" className="text-ui-fg-subtle">
                        No line items
                      </Text>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-ui-border-base/70 bg-ui-bg-base p-4">
                <Text weight="plus" className="mb-3">
                  Customer & delivery
                </Text>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoMini label="Customer" value={customerName(order)} />
                  <InfoMini label="Contact" value={customerPhone(order)} />
                  <InfoMini label="Email" value={customerEmailDisplay(order)} />
                  <InfoMini
                    label="Payment"
                    value={`${order.payment_type || "Prepaid"}${order.payment_type === "PostPaid" ? "" : " · Paid online"}`}
                  />
                </div>
                <div className="mt-3 space-y-2">
                  <div>
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Shipping address
                    </Text>
                    <Text size="small" className="mt-0.5 break-words">
                      {addressLineSafe(order, order.shipping_address)}
                    </Text>
                  </div>
                  <div>
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Billing address
                    </Text>
                    <Text size="small" className="mt-0.5 break-words">
                      {addressLineSafe(order, order.billing_address)}
                    </Text>
                  </div>
                </div>
              </div>

              <InfoBlock
                title="Shipping"
                rows={[
                  [
                    "Method",
                    workflow.shipping_method === "easy"
                      ? "Easy Shipping"
                      : workflow.shipping_method === "self"
                        ? "Self Shipping"
                        : "Not selected",
                  ],
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
                        [
                          "Shiprocket order",
                          workflow.shiprocket_order_id ? String(workflow.shiprocket_order_id) : "N/A",
                        ] as [string, string],
                        [
                          "Shiprocket shipment",
                          workflow.shiprocket_shipment_id
                            ? String(workflow.shiprocket_shipment_id)
                            : "N/A",
                        ] as [string, string],
                      ]
                    : [["Packing", workflow.self_packing_info || "N/A"] as [string, string]]),
                ]}
              />
            </div>

            <div className="space-y-5">
              <div className="rounded-xl border border-ui-border-base/70 bg-gradient-to-b from-ui-bg-subtle/40 to-ui-bg-base p-4">
                <Text weight="plus" className="mb-1">
                  Payment summary
                </Text>
                <Text size="xsmall" className="mb-3 text-ui-fg-muted">
                  GST-inclusive catalog price split for settlement
                </Text>
                <div className="space-y-2 text-sm">
                  <SummaryRow label="Item total" value={formatCurrency(itemTotal, currency)} />
                  <SummaryRow label="Taxable value" value={formatCurrency(taxable, currency)} />
                  <SummaryRow
                    label={gstRate > 0 ? `GST (${gstRate}%)` : "GST"}
                    value={formatCurrency(gst, currency)}
                    hint={
                      gst <= 0
                        ? "Set Tax Code / GST on the product to split GST from the inclusive price"
                        : undefined
                    }
                  />
                  <SummaryRow
                    label="Marketplace fee"
                    value={`−${formatCurrency(commission, currency)}`}
                    muted
                  />
                  <SummaryRow label="TCS" value={`−${formatCurrency(tcs, currency)}`} muted />
                  <SummaryRow label="TDS" value={`−${formatCurrency(tds, currency)}`} muted />
                  <div className="my-2 border-t border-ui-border-base/70" />
                  <div className="flex items-center justify-between gap-3">
                    <Text weight="plus">Estimated payout</Text>
                    <Text weight="plus" className="text-base text-emerald-700">
                      {formatCurrency(payout, currency)}
                    </Text>
                  </div>
                </div>
                <Text size="xsmall" className="mt-3 leading-relaxed text-ui-fg-muted">
                  Payout = Taxable − commission − TCS − TDS. Courier fees are deducted later at
                  dispatch / return.
                </Text>
              </div>

              <InfoBlock
                title="Order meta"
                rows={[
                  ["Order ID", order.id],
                  ["Display ID", compactOrderId(order)],
                  ["Status", order.vendor_status_label],
                  ["Created", formatDate(order.created_at)],
                ]}
              />

              <InfoBlock
                title="Timeline"
                rows={timeline.map(([label, value]) => [label, String(value)])}
              />
            </div>
          </div>

          {tracking && <TrackingPanel tracking={tracking} />}
        </div>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  muted,
  hint,
}: {
  label: string
  value: string
  muted?: boolean
  hint?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Text size="small" className={muted ? "text-ui-fg-subtle" : "text-ui-fg-base"}>
          {label}
        </Text>
        <Text size="small" className={muted ? "text-ui-fg-subtle" : "text-ui-fg-base"}>
          {value}
        </Text>
      </div>
      {hint ? (
        <Text size="xsmall" className="mt-0.5 text-amber-700">
          {hint}
        </Text>
      ) : null}
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
  onPackageChange,
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
  onPackageChange: (next: { weight: string; length: string; breadth: string; height: string }) => void
  onRefreshRates: () => void
  onSelect: (id: number) => void
  onClose: () => void
  onSubmit: () => void
}) {
  const setField = (key: keyof typeof pkg, value: string) =>
    onPackageChange({ ...pkg, [key]: value })

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
            {compactOrderId(order)} · Shiprocket rates & courier partners
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
            <div className="flex items-center justify-between gap-2">
              <Text size="small" weight="plus">Available courier services</Text>
              {!loading && couriers.length > 0 ? (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {couriers.length} from Shiprocket
                </Text>
              ) : null}
            </div>
            {loading ? (
              <Text size="small" className="text-ui-fg-subtle">Loading couriers…</Text>
            ) : couriers.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No courier partners for this package / pincode. Adjust weight or size and refresh.
              </Text>
            ) : (
              <>
                {couriers.length === 1 ? (
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Shiprocket only returned 1 serviceable courier for this pickup → delivery
                    pincode and package. That is usually lane coverage on your Shiprocket
                    account, not a UI filter.
                  </Text>
                ) : null}
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
              </>
            )}
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
              couriers.length === 0
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
          <Text size="small" className="mt-2 text-ui-fg-subtle">
            Like Amazon: enter courier + tracking ID, then RTD. Order moves to{" "}
            <strong>To Dispatch</strong>. Click Confirm ship when the courier picks it up to move
            to In Transit.
          </Text>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <Field
            label="Courier partner name"
            value={form.courier_partner_name}
            placeholder="e.g. Delhivery, BlueDart, Shiprocket"
            onChange={(value) => setField("courier_partner_name", value)}
          />
          <label className="block">
            <Text size="small" weight="plus" className="mb-1.5">Booked through</Text>
            <select
              value={form.tracking_source}
              onChange={(event) => setField("tracking_source", event.target.value as "shiprocket" | "carrier_api" | "manual")}
              className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base px-3 text-sm outline-none focus:border-ui-border-strong"
            >
              <option value="shiprocket">Shiprocket aggregator (auto status)</option>
              <option value="carrier_api">Direct carrier API (auto status)</option>
              <option value="manual">Tracking link (Confirm ship moves to In Transit; delivery may need admin/feed)</option>
            </select>
          </label>
          <Field
            label="AWB / Tracking ID"
            value={form.awb}
            placeholder="123-456-789"
            onChange={(value) => setField("awb", value)}
          />
          <Field
            label="Tracking URL (optional — auto-filled for known couriers)"
            value={form.tracking_url}
            placeholder="https://www.delhivery.com/track/package/…"
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
          <Button onClick={onSubmit} disabled={busy || !complete}>{busy ? "Saving..." : "Save tracking"}</Button>
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
