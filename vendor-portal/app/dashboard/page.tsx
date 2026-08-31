"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import {
  ArrowPath,
  ArchiveBox,
  ArrowRightMini,
  Calendar,
  CurrencyDollar,
  DocumentText,
  ShoppingCart,
  Tag,
} from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import DashboardSection from "@/components/dashboard/DashboardSection"
import DashboardSalesChart from "@/components/dashboard/DashboardSalesChart"
import DashboardQuickActions from "@/components/dashboard/DashboardQuickActions"
import DashboardAnnouncements from "@/components/dashboard/DashboardAnnouncements"
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
import { hasPageCache, peekPageCache, writePageCache } from "@/lib/page-cache"
import { useRouter } from "next/navigation"
import Link from "next/link"
import PageSkeleton from "@/components/PageSkeleton"

type VendorInfo = {
  name?: string
  email?: string
  store_name?: string
}

type DashboardCachePayload = {
  data: DashboardData
  vendorInfo: VendorInfo | null
}

const DASHBOARD_CACHE_KEY = "dashboard"

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
    initiated: number
    pickedUp: number
    delivered: number
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
  snapshot: {
    salesToday: number
    returnsToday: number
    paymentInitiated: number
  }
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(Number.isFinite(amount) ? amount : 0)

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

/** Compare calendar day in Asia/Kolkata so "today" matches vendor business day. */
const isToday = (dateString?: string | null) => {
  if (!dateString) return false
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime())) return false
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  return dayKey.format(parsed) === dayKey.format(new Date())
}

const daysAgoStart = (n: number) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.getTime()
}

const orderAmount = (order: any) => {
  if (typeof order?.total === "number" && Number.isFinite(order.total)) return order.total
  if (typeof order?.total?.amount === "number" && Number.isFinite(order.total.amount)) {
    return order.total.amount
  }
  const items = Array.isArray(order?.items) ? order.items : []
  if (items.length) {
    return items.reduce(
      (sum: number, item: any) =>
        sum + (Number(item.unit_price || 0) || 0) * (Number(item.quantity || 1) || 1),
      0
    )
  }
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
      label: day.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
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
  // Today's sales = GMV of orders placed today (vendor business day)
  const todaysSale = todayOrders.reduce((sum, order) => sum + orderAmount(order), 0)
  // Payout expected today: unlocking entries that unlock today, else available+unlocking
  const unlockingToday = Array.isArray(payoutSummary?.unlocking)
    ? payoutSummary.unlocking.filter((item: any) => isToday(item.unlock_at || item.delivered_at))
    : []
  const unlockingTodayTotal = unlockingToday.reduce(
    (sum: number, item: any) => sum + (Number(item.net_amount || 0) || 0),
    0
  )
  const paymentInitiatedToday =
    unlockingTodayTotal > 0
      ? unlockingTodayTotal
      : Number(payoutSummary?.available_balance || 0) +
        Number(payoutSummary?.unlocking_balance || 0)

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
  const initiatedReturns = returns.filter((request) =>
    ["pending_approval", "pending", "approved"].includes(
      String(request?.status || "").toLowerCase()
    )
  )
  const pickedUpReturns = returns.filter((request) =>
    ["pickup_initiated", "picked_up"].includes(String(request?.status || "").toLowerCase())
  )
  const deliveredReturns = returns.filter((request) =>
    ["received", "refunded", "replaced", "closed"].includes(
      String(request?.status || "").toLowerCase()
    )
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
      initiated: initiatedReturns.length,
      pickedUp: pickedUpReturns.length,
      delivered: deliveredReturns.length,
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
    topProducts: buildTopProducts(orders).slice(0, 3),
    snapshot: {
      salesToday: todaysSale,
      returnsToday: returns.filter((request) => isToday(request.created_at)).length,
      paymentInitiated: paymentInitiatedToday,
    },
  }
}

const KpiCard = ({
  href,
  icon,
  label,
  value,
  subtitle,
  helper,
  footer,
  metrics,
}: {
  href: string
  icon: React.ReactNode
  label: string
  value: string | number
  subtitle?: string
  helper?: string
  footer: string
  metrics: Array<{ label: string; value: string | number; variant?: StatusVariant }>
}) => (
  <div className="flex h-full flex-col rounded-xl border border-black/5 bg-white p-3 shadow-sm dark:border-ui-border-base/70 dark:bg-ui-bg-base">
    <div className="mb-1.5 flex items-center gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-700 [&_svg]:h-3.5 [&_svg]:w-3.5 dark:bg-oweg-500/15 dark:text-oweg-700">
        {icon}
      </div>
      <Text size="small" weight="plus" className="text-[13px] text-zinc-800 dark:text-ui-fg-base">
        {label}
      </Text>
    </div>
    <div className="flex items-baseline gap-1.5">
      <Heading
        level="h2"
        className="text-[1.35rem] font-semibold leading-none tracking-tight text-zinc-900 dark:text-ui-fg-base md:text-[1.5rem]"
      >
        {typeof value === "number" ? String(value) : value}
      </Heading>
      {subtitle ? (
        <Text size="xsmall" className="text-zinc-500 dark:text-ui-fg-subtle">
          {subtitle}
        </Text>
      ) : null}
    </div>
    {helper ? (
      <Text size="xsmall" className="mt-1 font-medium text-emerald-700 dark:text-oweg-600">
        {helper}
      </Text>
    ) : null}
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {metrics.map((metric) => (
        <span key={metric.label} className="flex items-center gap-1">
          <StatusDot variant={metric.variant || "neutral"} />
          <Text size="xsmall" className="text-[11px] text-zinc-500 dark:text-ui-fg-subtle">
            {metric.label}
          </Text>
          <Text size="xsmall" weight="plus" className="text-[11px] text-zinc-800 dark:text-ui-fg-base">
            {metric.value}
          </Text>
        </span>
      ))}
    </div>
    <Link
      href={href}
      className="mt-auto inline-flex items-center gap-0.5 pt-2.5 text-xs font-medium text-emerald-700 no-underline hover:underline dark:text-oweg-600"
    >
      {footer}
      <ArrowRightMini />
    </Link>
  </div>
)

const SnapshotChip = ({
  label,
  value,
  href,
  icon,
  hint,
}: {
  label: string
  value: string | number
  href: string
  icon: React.ReactNode
  hint?: string
}) => (
  <div className="min-w-[140px] flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-sm">
    <div className="mb-1 flex items-center gap-1.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/15 text-white [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
      </span>
      <Text size="xsmall" className="text-white/75">
        {label}
      </Text>
    </div>
    <Text weight="plus" className="text-lg leading-tight text-white md:text-xl">
      {value}
    </Text>
    {hint ? (
      <Text size="xsmall" className="mt-0.5 text-white/55">
        {hint}
      </Text>
    ) : null}
    <Link
      href={href}
      className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-white/85 no-underline hover:text-white"
    >
      View details
      <ArrowRightMini />
    </Link>
  </div>
)

const VendorDashboardPage = () => {
  const router = useRouter()
  const cached = peekPageCache<DashboardCachePayload>(DASHBOARD_CACHE_KEY)
  const [data, setData] = useState<DashboardData | null>(cached?.data ?? null)
  const [vendorInfo, setVendorInfo] = useState<VendorInfo | null>(cached?.vendorInfo ?? null)
  const [loading, setLoading] = useState(() => !hasPageCache(DASHBOARD_CACHE_KEY))
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDashboardData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent) || hasPageCache(DASHBOARD_CACHE_KEY)
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

      const nextVendor = profileData?.vendor || null
      const nextData = buildDashboardData({
        products: productsData?.products || [],
        orders: ordersData?.orders || [],
        returns: returnsData?.return_requests || [],
        reports: reportsData?.reports || [],
        payoutSummary: payoutData?.summary || {},
        payoutTotals: payoutData?.totals || {},
      })
      setVendorInfo(nextVendor)
      setData(nextData)
      writePageCache(DASHBOARD_CACHE_KEY, {
        data: nextData,
        vendorInfo: nextVendor,
      } satisfies DashboardCachePayload)
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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadDashboardData({ silent: true })
    } finally {
      setRefreshing(false)
    }
  }, [loadDashboardData])

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

  let content

  if (loading && !data) {
    content = <PageSkeleton label="Loading dashboard…" />
  } else if (error && !data) {
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
    const orderDelta = data.orders.today

    content = (
      <Container className="mx-auto max-w-[1400px] space-y-3 bg-transparent p-3 md:p-4">
        {/* Hero */}
        <section className="animate-fade-in-up relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a3d32] via-[#0f5c45] to-[#147a56] p-3.5 text-white shadow-sm md:p-4">
          <div className="relative flex flex-wrap items-start justify-between gap-2">
            <div className="max-w-xl">
              <Heading level="h1" className="text-xl text-white md:text-2xl">
                {getTimeGreeting()}, {displayName}!
              </Heading>
              <Text className="mt-1 text-xs text-white/75 md:text-sm">
                Here&apos;s a quick overview of your business.
              </Text>
            </div>
            <Button
              size="small"
              variant="secondary"
              disabled={refreshing}
              className="!border-white/20 !bg-white/10 !text-white hover:!bg-white/15"
              onClick={() => void handleRefresh()}
            >
              <ArrowPath className={refreshing ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>

          <div className="relative mt-3 flex flex-wrap gap-2">
            <SnapshotChip
              href="/orders"
              label="Today's sales"
              value={formatCurrency(data.snapshot.salesToday)}
              icon={<CurrencyDollar />}
            />
            <SnapshotChip
              href="/returns"
              label="Today's returns"
              value={data.snapshot.returnsToday}
              icon={<ArrowPath />}
            />
            <SnapshotChip
              href="/payout"
              label="Payment initiated"
              value={formatCurrency(data.snapshot.paymentInitiated)}
              hint="(expected by today)"
              icon={<Calendar />}
            />
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            {/* KPI grid — keep both rows visible without scrolling */}
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                href="/products"
                icon={<Tag />}
                label="Catalog"
                value={data.products.totalPublished}
                subtitle="Total products"
                footer="Manage catalog"
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
                subtitle="Total orders"
                footer="View all orders"
                metrics={[
                  {
                    label: "To be accepted",
                    value: data.orders.toAccept,
                    variant: "warning",
                  },
                  {
                    label: "In transit",
                    value: data.orders.inTransit,
                    variant: "info",
                  },
                  {
                    label: "Delivered",
                    value: data.orders.delivered,
                    variant: "success",
                  },
                ]}
              />
              <KpiCard
                href="/returns"
                icon={<ArrowPath />}
                label="Returns"
                value={data.returns.total}
                subtitle="Total returns"
                footer="View returns"
                metrics={[
                  {
                    label: "Return initiated",
                    value: data.returns.initiated,
                    variant: "warning",
                  },
                  {
                    label: "Picked up",
                    value: data.returns.pickedUp,
                    variant: "info",
                  },
                  {
                    label: "Delivered",
                    value: data.returns.delivered,
                    variant: "success",
                  },
                ]}
              />
              <KpiCard
                href="/orders"
                icon={<CurrencyDollar />}
                label="Total sales"
                value={formatCurrency(data.sales.total)}
                helper={trendLabel}
                footer="View sales report"
                metrics={[
                  {
                    label: "Last 7 days",
                    value: formatCurrency(data.sales.last7Days),
                    variant: "info",
                  },
                  {
                    label: "vs last week",
                    value: `${orderDelta >= 0 ? "+" : ""}${orderDelta}`,
                    variant: orderDelta >= 0 ? "success" : "warning",
                  },
                ]}
              />
              <KpiCard
                href="/payout"
                icon={<ArchiveBox />}
                label="Payout"
                value={formatCurrency(data.payout.pending)}
                subtitle="Available + unlocking balance"
                footer="View payouts"
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
                value={data.reports.open + data.reports.inReview}
                subtitle={
                  data.reports.open + data.reports.inReview === 0
                    ? "No open claims"
                    : "Open claims"
                }
                footer="View claims"
                metrics={[
                  { label: "Open", value: data.reports.open, variant: "warning" },
                  { label: "Resolved", value: data.reports.resolved, variant: "success" },
                ]}
              />
            </div>

            {/* Sales + top products */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.9fr)]">
              <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm dark:border-ui-border-base/70 dark:bg-ui-bg-base md:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <Text weight="plus" className="text-[15px] text-zinc-900 dark:text-ui-fg-base">
                    Sales performance
                  </Text>
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-600 dark:border-ui-border-base dark:bg-ui-bg-subtle dark:text-ui-fg-subtle">
                    Last 7 days
                  </span>
                </div>
                <DashboardSalesChart series={data.weekSeries} formatValue={formatCurrency} />
                <Link
                  href="/orders"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 no-underline hover:underline dark:text-oweg-600"
                >
                  View full report
                  <ArrowRightMini />
                </Link>
              </div>

              <DashboardSection title="Top products">
                <div className="rounded-2xl border border-black/5 bg-white shadow-sm dark:border-ui-border-base/70 dark:bg-ui-bg-base">
                  <div className="flex items-center justify-end px-4 pt-3">
                    <Link
                      href="/products"
                      className="text-xs font-medium text-emerald-700 no-underline hover:underline dark:text-oweg-600"
                    >
                      View all
                    </Link>
                  </div>
                  {data.topProducts.length === 0 ? (
                    <div className="px-4 pb-4 pt-2">
                      <Text size="small" className="text-zinc-500 dark:text-ui-fg-subtle">
                        Product mix will appear as orders come in.
                      </Text>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100 dark:divide-ui-border-base/70">
                      {data.topProducts.map((product, index) => (
                        <div key={product.title} className="flex items-center gap-3 px-4 py-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-xs font-semibold text-emerald-800 dark:bg-oweg-500/15 dark:text-oweg-800">
                            {index + 1}
                          </span>
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[10px] font-medium uppercase text-zinc-500 dark:bg-ui-bg-subtle dark:text-ui-fg-muted">
                            {product.title.slice(0, 2)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <Text weight="plus" className="truncate text-zinc-900 dark:text-ui-fg-base">
                              {product.title}
                            </Text>
                            <Text size="small" className="text-zinc-500 dark:text-ui-fg-subtle">
                              {product.quantity} units
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
          </div>

          <aside className="space-y-4">
            <DashboardQuickActions />
            <DashboardAnnouncements />
          </aside>
        </div>
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorDashboardPage
