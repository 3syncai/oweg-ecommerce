"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button, Container, Heading, Text, clx } from "@medusajs/ui"
import {
  ArrowPath,
  ArchiveBox,
  ArrowUpRightMini,
  CurrencyDollar,
  DocumentText,
  Plus,
  ShoppingCart,
  Tag,
} from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import EmptyState from "@/components/EmptyState"
import DashboardSection from "@/components/dashboard/DashboardSection"
import StatusDot, { type StatusVariant } from "@/components/dashboard/StatusDot"
import {
  vendorOrdersApi,
  vendorPayoutsApi,
  vendorProductsApi,
  vendorProfileApi,
  vendorReportsApi,
  vendorReturnsApi,
  type VendorReportTicket,
} from "@/lib/api/client"
import { useVendorLive } from "@/lib/useVendorLive"
import { useRouter } from "next/navigation"
import Link from "next/link"

type VendorInfo = {
  name?: string
  email?: string
  store_name?: string
}

type ActivityFilter = "all" | "orders" | "returns" | "tickets"

type ActivityItem = {
  id: string
  kind: ActivityFilter extends "all" ? string : ActivityFilter
  title: string
  description: string
  href: string
  at: string
  variant: StatusVariant
}

type AttentionItem = {
  href: string
  title: string
  detail: string
  value: number | string
  variant: StatusVariant
  priority: number
}

type DayPoint = {
  key: string
  label: string
  orders: number
  sales: number
}

type TopProduct = {
  title: string
  quantity: number
  revenue: number
}

type DashboardData = {
  products: {
    totalPublished: number
    active: number
    inactive: number
    pendingApproval: number
  }
  orders: {
    total: number
    today: number
    inTransit: number
    inTransitToday: number
    delivered: number
    deliveredToday: number
    toAccept: number
  }
  returns: {
    total: number
    inProgress: number
    refunded: number
    today: number
  }
  reports: {
    total: number
    open: number
    inReview: number
    resolved: number
  }
  sales: {
    total: number
    today: number
    last7Days: number
    prev7Days: number
    trendPct: number | null
  }
  payout: {
    totalPaid: number
    pending: number
    credited: number
  }
  weekSeries: DayPoint[]
  topProducts: TopProduct[]
  recentActivity: ActivityItem[]
  attention: AttentionItem[]
  snapshot: {
    salesToday: number
    toAccept: number
    returnsToday: number
  }
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(Number.isFinite(amount) ? amount : 0)

const formatDateTime = (dateString?: string | null) => {
  if (!dateString) return "N/A"
  return new Date(dateString).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const formatRelativeTime = (dateString?: string | null) => {
  if (!dateString) return "N/A"
  const diffMs = Date.now() - new Date(dateString).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDateTime(dateString)
}

const getTimeGreeting = () => {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    })
      .formatToParts(new Date())
      .find((part) => part.type === "hour")?.value ?? 0
  )

  if (hour >= 5 && hour < 12) return "Good morning"
  if (hour >= 12 && hour < 17) return "Good afternoon"
  if (hour >= 17 && hour < 22) return "Good evening"
  return "Good night"
}

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

const startOfToday = () => startOfDay(new Date())

const isToday = (dateString?: string | null) => {
  if (!dateString) return false
  return new Date(dateString).getTime() >= startOfToday()
}

const daysAgoStart = (n: number) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.getTime()
}

const orderAmount = (order: any) => {
  if (typeof order?.total === "number") return order.total
  if (typeof order?.total?.amount === "number") return order.total.amount
  return 0
}

const isActiveProduct = (product: any) => {
  const status = String(product?.status || "").toLowerCase()
  const approval = String(product?.metadata?.approval_status || "").toLowerCase()
  return status === "published" && !["pending", "rejected", "draft"].includes(approval)
}

const orderStage = (order: any) =>
  String(order?.vendor_stage || order?.fulfillment_status || order?.status || "to_accept").toLowerCase()

/** Latest delivery timestamp from fulfillments (falls back for delivered orders missing delivered_at). */
const orderDeliveredAt = (order: any): string | null => {
  const fulfillments = Array.isArray(order?.fulfillments) ? order.fulfillments : []
  let latest = 0
  for (const fulfillment of fulfillments) {
    const raw = fulfillment?.delivered_at
    if (!raw) continue
    const t = new Date(raw).getTime()
    if (!Number.isNaN(t) && t > latest) latest = t
  }
  if (latest > 0) return new Date(latest).toISOString()
  if (orderStage(order) === "delivered") {
    return order.updated_at || order.created_at || null
  }
  return null
}

const activityVariant = (kind: string): StatusVariant => {
  if (["delivered", "credited", "active", "resolved"].includes(kind)) return "success"
  if (["return", "pending", "to_accept", "open"].includes(kind)) return "warning"
  if (["reversed", "rejected"].includes(kind)) return "error"
  if (["in_review"].includes(kind)) return "info"
  return "info"
}

function buildWeekSeries(orders: any[]): DayPoint[] {
  const points: DayPoint[] = []
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date()
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - i)
    const start = day.getTime()
    const end = start + 24 * 60 * 60 * 1000
    const dayOrders = orders.filter((order) => {
      const t = new Date(order.created_at).getTime()
      return t >= start && t < end
    })
    points.push({
      key: day.toISOString().slice(0, 10),
      label: day.toLocaleDateString("en-IN", { weekday: "short" }),
      orders: dayOrders.length,
      sales: dayOrders.reduce((sum, order) => sum + orderAmount(order), 0),
    })
  }
  return points
}

function buildTopProducts(orders: any[]): TopProduct[] {
  const map = new Map<string, TopProduct>()
  for (const order of orders) {
    const names: string[] = Array.isArray(order.product_names) ? order.product_names : []
    const items: any[] = Array.isArray(order.items) ? order.items : []

    if (items.length) {
      for (const item of items) {
        const title = String(item.title || "Product").trim() || "Product"
        const quantity = Number(item.quantity || 1) || 1
        const unit = Number(item.unit_price || 0) || 0
        const existing = map.get(title) || { title, quantity: 0, revenue: 0 }
        existing.quantity += quantity
        existing.revenue += unit * quantity
        map.set(title, existing)
      }
      continue
    }

    for (const name of names) {
      const title = String(name || "Product").trim() || "Product"
      const existing = map.get(title) || { title, quantity: 0, revenue: 0 }
      existing.quantity += 1
      map.set(title, existing)
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 5)
}

function buildDashboardData(input: {
  products: any[]
  orders: any[]
  returns: any[]
  reports: VendorReportTicket[]
  payoutSummary: any
  payoutTotals?: any
}): DashboardData {
  const { products, orders, returns, reports, payoutSummary, payoutTotals } = input

  const active = products.filter(isActiveProduct).length
  const inactive = Math.max(products.length - active, 0)
  const pendingApproval = products.filter(
    (product) => String(product?.metadata?.approval_status || "").toLowerCase() === "pending"
  ).length

  const inTransitOrders = orders.filter((order) => orderStage(order) === "in_transit")
  const deliveredOrders = orders.filter((order) => orderStage(order) === "delivered")
  const toAcceptOrders = orders.filter((order) => orderStage(order) === "to_accept")
  const todayOrders = orders.filter((order) => isToday(order.created_at))
  const todayDeliveredOrders = deliveredOrders.filter((order) =>
    isToday(orderDeliveredAt(order))
  )

  const totalSale = orders.reduce((sum, order) => sum + orderAmount(order), 0)
  // Today's sale = GMV of orders delivered today (not placed today)
  const todaysSale = todayDeliveredOrders.reduce((sum, order) => sum + orderAmount(order), 0)

  const last7Start = daysAgoStart(6)
  const prev7Start = daysAgoStart(13)
  const prev7End = daysAgoStart(7)

  const last7Orders = orders.filter((o) => new Date(o.created_at).getTime() >= last7Start)
  const prev7Orders = orders.filter((o) => {
    const t = new Date(o.created_at).getTime()
    return t >= prev7Start && t < prev7End
  })
  const last7Days = last7Orders.reduce((sum, o) => sum + orderAmount(o), 0)
  const prev7Days = prev7Orders.reduce((sum, o) => sum + orderAmount(o), 0)
  const trendPct =
    prev7Days > 0
      ? ((last7Days - prev7Days) / prev7Days) * 100
      : last7Days > 0
        ? 100
        : null

  const inProgressReturns = returns.filter((request) =>
    ["approved", "pickup_initiated", "picked_up", "received", "pending_approval", "pending"].includes(
      String(request?.status || "").toLowerCase()
    )
  )
  const refundedReturns = returns.filter((request) =>
    ["refunded", "replaced", "closed"].includes(String(request?.status || "").toLowerCase())
  )

  const openTickets = reports.filter((r) => String(r.status).toLowerCase() === "open")
  const inReviewTickets = reports.filter((r) => String(r.status).toLowerCase() === "in_review")
  const resolvedTickets = reports.filter((r) =>
    ["resolved", "closed"].includes(String(r.status).toLowerCase())
  )

  const totalPaid =
    Number(payoutSummary?.total_withdrawn || 0) ||
    Number(payoutTotals?.total_credited || 0) ||
    0
  const credited = Number(payoutSummary?.total_credited || 0)
  const pending =
    Number(payoutSummary?.available_balance || 0) +
    Number(payoutSummary?.unlocking_balance || 0)

  const activity: ActivityItem[] = []

  for (const order of orders) {
    const stage = orderStage(order)
    const statusLabel =
      order.vendor_status_label ||
      (stage === "to_accept" ? "Pending acceptance" : stage.replace(/_/g, " "))
    activity.push({
      id: `order-${order.id}-${stage}`,
      kind: "orders",
      title: `Order ${order.display_id || String(order.id).slice(0, 10)}`,
      description: `${statusLabel} · ${formatCurrency(orderAmount(order))}`,
      href: "/orders",
      at: order.updated_at || order.created_at,
      variant: activityVariant(stage),
    })
  }

  for (const item of returns) {
    const status = String(item.status || "return").replace(/_/g, " ")
    activity.push({
      id: `return-${item.id}`,
      kind: "returns",
      title: `Return ${item.order_display_id || String(item.order_id || "").slice(0, 10)}`,
      description: `${status}${item.reason ? ` · ${item.reason}` : ""}`,
      href: "/returns",
      at: item.updated_at || item.created_at,
      variant: activityVariant("return"),
    })
  }

  for (const ticket of reports) {
    activity.push({
      id: `ticket-${ticket.id}`,
      kind: "tickets",
      title: ticket.issue_title || "Claim",
      description: `Order #${ticket.order_display_id || String(ticket.order_id).slice(-6)} · ${(ticket.status || "open").replace(/_/g, " ")}`,
      href: "/claims",
      at: ticket.updated_at || ticket.created_at || new Date().toISOString(),
      variant: activityVariant(String(ticket.status || "open").toLowerCase()),
    })
  }

  for (const item of payoutSummary?.unlocking || []) {
    activity.push({
      id: `payout-unlocking-${item.id}`,
      kind: "orders",
      title: `Payout pending ${item.order_display_id || String(item.order_id).slice(0, 10)}`,
      description: `${formatCurrency(Number(item.net_amount || 0))} unlocking`,
      href: "/payout",
      at: item.delivered_at || item.unlock_at,
      variant: "warning",
    })
  }

  for (const item of payoutSummary?.credited_recent || []) {
    activity.push({
      id: `payout-credited-${item.id}`,
      kind: "orders",
      title: `Payout credited ${item.order_display_id || String(item.order_id).slice(0, 10)}`,
      description: `${formatCurrency(Number(item.net_amount || 0))} credited`,
      href: "/payout",
      at: item.credited_at,
      variant: "success",
    })
  }

  const attention: AttentionItem[] = []
  if (pendingApproval) {
    attention.push({
      href: "/products",
      title: "Products awaiting approval",
      detail: "Admin review before catalog publish",
      value: pendingApproval,
      variant: "info",
      priority: 1,
    })
  }
  if (inactive > 0) {
    attention.push({
      href: "/products",
      title: "Inactive products",
      detail: "Fix listing status or approval",
      value: inactive,
      variant: "neutral",
      priority: 2,
    })
  }
  if (pending > 0) {
    attention.push({
      href: "/payout",
      title: "Payout pending",
      detail: "Available + unlocking balance",
      value: formatCurrency(pending),
      variant: "info",
      priority: 3,
    })
  }

  attention.sort((a, b) => a.priority - b.priority)

  return {
    products: {
      totalPublished: products.length,
      active,
      inactive,
      pendingApproval,
    },
    orders: {
      total: orders.length,
      today: todayOrders.length,
      inTransit: inTransitOrders.length,
      inTransitToday: inTransitOrders.filter((order) =>
        isToday(order.updated_at || order.created_at)
      ).length,
      delivered: deliveredOrders.length,
      deliveredToday: todayDeliveredOrders.length,
      toAccept: toAcceptOrders.length,
    },
    returns: {
      total: returns.length,
      inProgress: inProgressReturns.length,
      refunded: refundedReturns.length,
      today: returns.filter((request) => isToday(request.created_at)).length,
    },
    reports: {
      total: reports.length,
      open: openTickets.length,
      inReview: inReviewTickets.length,
      resolved: resolvedTickets.length,
    },
    sales: {
      total: totalSale,
      today: todaysSale,
      last7Days,
      prev7Days,
      trendPct,
    },
    payout: {
      totalPaid,
      pending,
      credited,
    },
    weekSeries: buildWeekSeries(orders),
    topProducts: buildTopProducts(orders),
    recentActivity: activity
      .filter((item) => item.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 10),
    attention,
    snapshot: {
      salesToday: todaysSale,
      toAccept: toAcceptOrders.length,
      returnsToday: returns.filter((request) => isToday(request.created_at)).length,
    },
  }
}

const KpiCard = ({
  href,
  icon,
  label,
  value,
  helper,
  tone = "default",
  metrics,
}: {
  href: string
  icon: React.ReactNode
  label: string
  value: string | number
  helper?: string
  tone?: "default" | "hero"
  metrics: Array<{ label: string; value: string | number; variant?: StatusVariant }>
}) => (
  <Link href={href} className="block h-full text-inherit no-underline">
    <div
      className={clx(
        "group h-full rounded-2xl border bg-ui-bg-base p-4 md:p-5 transition-all duration-200",
        "hover:border-ui-border-strong hover:bg-ui-bg-subtle/40 hover:shadow-sm",
        "animate-fade-in-up",
        tone === "hero"
          ? "border-oweg-500/30 bg-gradient-to-br from-oweg-500/[0.12] via-ui-bg-base to-ui-bg-base"
          : "border-ui-border-base/70"
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div
          className={clx(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            tone === "hero" ? "bg-oweg-500/20 text-oweg-700" : "bg-oweg-500/10 text-oweg-700"
          )}
        >
          {icon}
        </div>
        <ArrowUpRightMini className="text-ui-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ui-fg-base" />
      </div>
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Heading level="h2" className="mt-1 text-2xl md:text-[1.75rem] leading-tight">
        {typeof value === "number" ? String(value) : value}
      </Heading>
      {helper && (
        <Text size="small" className="mt-1 text-ui-fg-subtle">
          {helper}
        </Text>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-ui-border-base/60 bg-ui-bg-subtle/40 px-2.5 py-2"
          >
            <span className="flex items-center gap-1.5">
              <StatusDot variant={metric.variant || "neutral"} />
              <Text size="xsmall" className="text-ui-fg-subtle">
                {metric.label}
              </Text>
            </span>
            <Text size="small" weight="plus" className="mt-1 truncate">
              {metric.value}
            </Text>
          </div>
        ))}
      </div>
    </div>
  </Link>
)

const SnapshotChip = ({
  label,
  value,
  href,
  hot,
}: {
  label: string
  value: string | number
  href: string
  hot?: boolean
}) => (
  <Link
    href={href}
    className={clx(
      "group inline-flex min-w-[140px] flex-1 flex-col rounded-2xl border px-4 py-3 transition",
      hot
        ? "border-white/25 bg-white/10 hover:bg-white/15"
        : "border-white/10 bg-white/5 hover:bg-white/10"
    )}
  >
    <Text size="xsmall" className="text-white/70">
      {label}
    </Text>
    <span className="mt-1 flex items-center justify-between gap-2">
      <Text weight="plus" className="text-lg text-white">
        {value}
      </Text>
      <ArrowUpRightMini className="text-white opacity-60 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </span>
  </Link>
)

const WeekBars = ({ series }: { series: DayPoint[] }) => {
  const max = Math.max(...series.map((d) => d.sales), 1)
  return (
    <div className="flex h-36 items-end gap-2">
      {series.map((day) => {
        const height = Math.max(8, Math.round((day.sales / max) * 100))
        const isTodayBar = day.key === new Date().toISOString().slice(0, 10)
        return (
          <div key={day.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-28 w-full items-end justify-center">
              <div
                title={`${day.label}: ${formatCurrency(day.sales)} · ${day.orders} orders`}
                className={clx(
                  "w-full max-w-[36px] rounded-t-lg transition-all duration-500",
                  isTodayBar
                    ? "bg-gradient-to-t from-oweg-600 to-oweg-400"
                    : "bg-oweg-500/25 hover:bg-oweg-500/45"
                )}
                style={{ height: `${height}%` }}
              />
            </div>
            <Text size="xsmall" className={clx(isTodayBar ? "text-oweg-700" : "text-ui-fg-muted")}>
              {day.label}
            </Text>
          </div>
        )
      })}
    </div>
  )
}

const VendorDashboardPage = () => {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [vendorInfo, setVendorInfo] = useState<VendorInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all")

  const loadDashboardData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent)
    try {
      if (!silent) setLoading(true)
      const [productsData, ordersData, returnsData, reportsData, payoutData, profileData] =
        await Promise.all([
          vendorProductsApi.list().catch(() => ({ products: [] })),
          vendorOrdersApi.list().catch(() => ({ orders: [] })),
          vendorReturnsApi.list().catch(() => ({ return_requests: [] })),
          vendorReportsApi.list().catch(() => ({ reports: [] as VendorReportTicket[] })),
          vendorPayoutsApi
            .list()
            .catch(() =>
              vendorPayoutsApi.summary().then((summary) => ({
                ...summary,
                payouts: [],
                totals: { total_credited: 0 },
              }))
            )
            .catch(() => ({
              summary: {
                available_balance: 0,
                unlocking_balance: 0,
                total_credited: 0,
                total_withdrawn: 0,
                unlocking: [],
                credited_recent: [],
                reversed_recent: [],
                reversed_total: 0,
              },
              payouts: [],
              totals: { total_credited: 0 },
            })),
          vendorProfileApi.getMe().catch(() => ({ vendor: null })),
        ])

      setVendorInfo(profileData?.vendor || null)
      setData(
        buildDashboardData({
          products: productsData?.products || [],
          orders: ordersData?.orders || [],
          returns: returnsData?.return_requests || [],
          reports: reportsData?.reports || [],
          payoutSummary: payoutData?.summary || {},
          payoutTotals: payoutData?.totals || {},
        })
      )
      setError(null)
    } catch (e: any) {
      if (e.status === 403) {
        router.push("/pending")
        return
      }
      setError(e?.message || "Failed to load dashboard")
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

    void loadDashboardData()
  }, [router, loadDashboardData])

  useVendorLive({
    onInvalidate: () => {
      void loadDashboardData({ silent: true })
    },
  })

  const displayName = useMemo(
    () => vendorInfo?.name?.split(" ")[0] || vendorInfo?.email?.split("@")[0] || "there",
    [vendorInfo]
  )

  const storeLabel = vendorInfo?.store_name ? `${vendorInfo.store_name} Store` : "Vendor workspace"

  const filteredActivity = useMemo(() => {
    if (!data) return []
    if (activityFilter === "all") return data.recentActivity
    return data.recentActivity.filter((item) => item.kind === activityFilter)
  }, [data, activityFilter])

  let content

  if (loading) {
    content = (
      <Container className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
        <div className="h-44 animate-pulse rounded-3xl bg-ui-bg-base-hover" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-52 animate-pulse rounded-2xl bg-ui-bg-base-hover" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <div className="h-96 animate-pulse rounded-2xl bg-ui-bg-base-hover" />
          <div className="h-96 animate-pulse rounded-2xl bg-ui-bg-base-hover" />
        </div>
      </Container>
    )
  } else if (error) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      </Container>
    )
  } else if (data) {
    const trend = data.sales.trendPct
    const trendLabel =
      trend == null
        ? "No prior week to compare"
        : `${trend >= 0 ? "+" : ""}${trend.toFixed(0)}% vs previous 7 days`

    content = (
      <Container className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
        {/* Hero */}
        <section className="animate-fade-in-up relative overflow-hidden rounded-3xl border border-oweg-500/20 bg-gradient-to-br from-[#0b3d2e] via-[#0f5c42] to-[#147a56] p-5 text-white shadow-sm md:p-6">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, #fff 0.8px, transparent 1px), radial-gradient(circle at 80% 0%, rgba(255,255,255,0.35), transparent 40%)",
              backgroundSize: "18px 18px, auto",
            }}
          />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <Text size="small" className="text-white/70">
                {storeLabel}
              </Text>
              <Heading level="h1" className="mt-1 text-2xl text-white md:text-3xl">
                {getTimeGreeting()}, {displayName}
              </Heading>
              <Text className="mt-2 text-sm text-white/75">
                Today’s pulse across sales, orders, returns, and claims.
              </Text>
            </div>
          </div>

          <div className="relative mt-5 flex flex-wrap gap-2.5">
            <SnapshotChip
              href="/orders"
              label="Today's sale"
              value={formatCurrency(data.snapshot.salesToday)}
            />
            <SnapshotChip
              href="/returns"
              label="Today's return"
              value={data.snapshot.returnsToday}
              hot={data.snapshot.returnsToday > 0}
            />
            <SnapshotChip
              href="/orders?stage=to_accept"
              label="To accept"
              value={data.snapshot.toAccept}
              hot={data.snapshot.toAccept > 0}
            />
          </div>
        </section>

        {/* Needs attention */}
        {data.attention.length > 0 && (
          <DashboardSection title="Needs attention">
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {data.attention.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="group flex items-center gap-3 rounded-2xl border border-ui-border-base/70 bg-ui-bg-base px-4 py-3.5 transition hover:border-ui-border-strong hover:bg-ui-bg-subtle/60"
                >
                  <StatusDot variant={item.variant} />
                  <div className="min-w-0 flex-1">
                    <Text weight="plus" className="truncate">
                      {item.title}
                    </Text>
                    <Text size="small" className="truncate text-ui-fg-subtle">
                      {item.detail}
                    </Text>
                  </div>
                  <Text weight="plus" className="shrink-0">
                    {item.value}
                  </Text>
                  <ArrowUpRightMini className="shrink-0 text-ui-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              ))}
            </div>
          </DashboardSection>
        )}

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            href="/products"
            icon={<Tag />}
            label="Catalog"
            value={data.products.totalPublished}
            helper={`${data.products.pendingApproval} awaiting approval`}
            metrics={[
              { label: "Active", value: data.products.active, variant: "success" },
              { label: "Inactive", value: data.products.inactive, variant: "warning" },
            ]}
          />
          <KpiCard
            href="/orders"
            icon={<ShoppingCart />}
            label="Orders"
            value={data.orders.total}
            helper={`${data.orders.today} today · ${data.orders.toAccept} to accept`}
            metrics={[
              {
                label: "In transit",
                value: `${data.orders.inTransit}`,
                variant: "info",
              },
              {
                label: "Delivered",
                value: `${data.orders.delivered}`,
                variant: "success",
              },
            ]}
          />
          <KpiCard
            href="/returns"
            icon={<ArrowPath />}
            label="Returns"
            value={data.returns.total}
            helper={`${data.returns.today} today`}
            metrics={[
              { label: "In progress", value: data.returns.inProgress, variant: "warning" },
              { label: "Closed", value: data.returns.refunded, variant: "success" },
            ]}
          />
          <KpiCard
            href="/orders"
            icon={<CurrencyDollar />}
            label="Total sale"
            value={formatCurrency(data.sales.total)}
            helper={`${formatCurrency(data.sales.today)} today · ${trendLabel}`}
            tone="hero"
            metrics={[
              {
                label: "Last 7 days",
                value: formatCurrency(data.sales.last7Days),
                variant: "info",
              },
              {
                label: "To accept",
                value: data.orders.toAccept,
                variant: "warning",
              },
            ]}
          />
          <KpiCard
            href="/payout"
            icon={<ArchiveBox />}
            label="Payout"
            value={formatCurrency(data.payout.totalPaid)}
            helper="Processed / paid amount"
            metrics={[
              {
                label: "Pending",
                value: formatCurrency(data.payout.pending),
                variant: "warning",
              },
              {
                label: "Credited",
                value: formatCurrency(data.payout.credited),
                variant: "success",
              },
            ]}
          />
          <KpiCard
            href="/claims"
            icon={<DocumentText />}
            label="Claims"
            value={data.reports.total}
            helper={`${data.reports.open} open · ${data.reports.inReview} in review`}
            metrics={[
              { label: "Open", value: data.reports.open, variant: "warning" },
              { label: "Resolved", value: data.reports.resolved, variant: "success" },
            ]}
          />
        </div>

        {/* Sales pulse + top products */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <DashboardSection
            title="Sales pulse · last 7 days"
            action={{ label: "View orders", onClick: () => router.push("/orders") }}
          >
            <div className="rounded-2xl border border-ui-border-base/70 bg-ui-bg-base p-4 md:p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <Text size="small" className="text-ui-fg-subtle">
                    Week sales
                  </Text>
                  <Heading level="h2" className="text-2xl">
                    {formatCurrency(data.sales.last7Days)}
                  </Heading>
                </div>
                <div
                  className={clx(
                    "rounded-full border px-3 py-1 text-sm",
                    trend != null && trend >= 0
                      ? "border-oweg-500/25 bg-oweg-500/10 text-oweg-800"
                      : "border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle"
                  )}
                >
                  {trendLabel}
                </div>
              </div>
              <WeekBars series={data.weekSeries} />
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-ui-fg-subtle">
                <span>
                  Orders this week:{" "}
                  <strong className="text-ui-fg-base">
                    {data.weekSeries.reduce((s, d) => s + d.orders, 0)}
                  </strong>
                </span>
                <span>
                  Avg / day:{" "}
                  <strong className="text-ui-fg-base">
                    {formatCurrency(data.sales.last7Days / 7)}
                  </strong>
                </span>
              </div>
            </div>
          </DashboardSection>

          <DashboardSection title="Top products">
            <div className="rounded-2xl border border-ui-border-base/70 bg-ui-bg-base">
              {data.topProducts.length === 0 ? (
                <div className="p-5">
                  <Text size="small" className="text-ui-fg-subtle">
                    Product mix will appear as orders come in.
                  </Text>
                </div>
              ) : (
                <div className="divide-y divide-ui-border-base/70">
                  {data.topProducts.map((product, index) => (
                    <div
                      key={product.title}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-oweg-500/10 text-xs font-semibold text-oweg-800">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Text weight="plus" className="truncate">
                          {product.title}
                        </Text>
                        <Text size="small" className="text-ui-fg-subtle">
                          {product.quantity} sold
                          {product.revenue > 0 ? ` · ${formatCurrency(product.revenue)}` : ""}
                        </Text>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DashboardSection>
        </div>

        {/* Activity + ops */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <DashboardSection title="Recent activity">
            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["orders", "Orders"],
                  ["returns", "Returns"],
                  ["tickets", "Tickets"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActivityFilter(key)}
                  className={clx(
                    "rounded-full border px-3 py-1.5 text-sm transition",
                    activityFilter === key
                      ? "border-oweg-500/40 bg-oweg-500/15 text-oweg-900"
                      : "border-ui-border-base bg-ui-bg-base text-ui-fg-subtle hover:bg-ui-bg-subtle"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {filteredActivity.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-ui-border-base/70 bg-ui-bg-base">
                <div className="divide-y divide-ui-border-base/70">
                  {filteredActivity.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="group grid grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition hover:bg-ui-bg-subtle/60"
                    >
                      <StatusDot variant={item.variant} />
                      <div className="min-w-0">
                        <Text weight="plus" className="truncate">
                          {item.title}
                        </Text>
                        <Text size="small" className="truncate text-ui-fg-subtle">
                          {item.description}
                        </Text>
                      </div>
                      <div className="flex items-center gap-2">
                        <Text size="small" className="text-ui-fg-muted">
                          {formatRelativeTime(item.at)}
                        </Text>
                        <ArrowUpRightMini className="hidden text-ui-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:block" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                accent="oweg"
                icon={<ShoppingCart />}
                title="Nothing in this filter"
                description="Try All, or create a product / process an order to see activity."
                primaryAction={{
                  label: "Create product",
                  onClick: () => router.push("/products/new"),
                }}
              />
            )}
          </DashboardSection>

          <div className="space-y-5">
            <DashboardSection title="Operational focus">
              <div className="space-y-2.5">
                <FocusRow
                  href="/orders?stage=to_accept"
                  label="Orders waiting to accept"
                  value={data.orders.toAccept}
                  variant={data.orders.toAccept > 0 ? "warning" : "success"}
                />
                <FocusRow
                  href="/orders"
                  label="Orders moving today"
                  value={data.orders.inTransitToday}
                  variant="info"
                />
                <FocusRow
                  href="/returns"
                  label="Returns in progress"
                  value={data.returns.inProgress}
                  variant={data.returns.inProgress > 0 ? "warning" : "success"}
                />
                <FocusRow
                  href="/claims"
                  label="Open claims"
                  value={data.reports.open + data.reports.inReview}
                  variant={
                    data.reports.open + data.reports.inReview > 0 ? "warning" : "success"
                  }
                />
                <FocusRow
                  href="/products"
                  label="Inactive products"
                  value={data.products.inactive}
                  variant={data.products.inactive > 0 ? "warning" : "success"}
                />
              </div>
            </DashboardSection>

            <DashboardSection title="Quick actions">
              <div className="grid gap-2.5">
                {[
                  { href: "/products/new", label: "Add product", icon: Plus },
                  { href: "/orders", label: "Process orders", icon: ShoppingCart },
                  { href: "/returns", label: "Review returns", icon: ArrowPath },
                  { href: "/claims", label: "Raise / view claims", icon: DocumentText },
                  { href: "/payout", label: "Check payout", icon: CurrencyDollar },
                  { href: "/products", label: "Manage catalog", icon: Tag },
                ].map((action) => (
                  <Link
                    key={action.href + action.label}
                    href={action.href}
                    className="group flex items-center gap-3 rounded-2xl border border-ui-border-base/70 bg-ui-bg-base p-3 transition hover:border-ui-border-strong hover:bg-ui-bg-subtle/60"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ui-bg-base-hover text-ui-fg-muted">
                      <action.icon />
                    </span>
                    <Text weight="plus" className="min-w-0 flex-1">
                      {action.label}
                    </Text>
                    <ArrowUpRightMini className="text-ui-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                ))}
              </div>
            </DashboardSection>
          </div>
        </div>
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

const FocusRow = ({
  href,
  label,
  value,
  variant,
}: {
  href: string
  label: string
  value: string | number
  variant: StatusVariant
}) => (
  <Link
    href={href}
    className="flex items-center justify-between gap-3 rounded-2xl border border-ui-border-base/70 bg-ui-bg-base px-4 py-3 transition hover:border-ui-border-strong hover:bg-ui-bg-subtle/60"
  >
    <span className="flex min-w-0 items-center gap-2">
      <StatusDot variant={variant} />
      <Text className="truncate">{label}</Text>
    </span>
    <Text weight="plus">{value}</Text>
  </Link>
)

export default VendorDashboardPage
