"use client"

import { useEffect, useMemo, useState } from "react"
import { Button, Container, Heading, Text, clx } from "@medusajs/ui"
import {
  ArrowPath,
  ArchiveBox,
  ArrowUpRightMini,
  CurrencyDollar,
  Plus,
  ShoppingCart,
  Tag,
} from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import EmptyState from "@/components/EmptyState"
import DashboardSection from "@/components/dashboard/DashboardSection"
import InsightPill from "@/components/dashboard/InsightPill"
import StatusDot, { type StatusVariant } from "@/components/dashboard/StatusDot"
import {
  vendorOrdersApi,
  vendorPayoutsApi,
  vendorProductsApi,
  vendorProfileApi,
  vendorReturnsApi,
} from "@/lib/api/client"
import { useRouter } from "next/navigation"
import Link from "next/link"

type VendorInfo = {
  name?: string
  email?: string
  store_name?: string
}

type ActivityItem = {
  id: string
  title: string
  description: string
  href: string
  at: string
  variant: StatusVariant
}

type KpiCardProps = {
  href: string
  icon: React.ReactNode
  label: string
  value: string | number
  helper?: string
  tone?: "default" | "hero"
  metrics: Array<{ label: string; value: string | number; variant?: StatusVariant }>
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
  sales: {
    total: number
    today: number
  }
  payout: {
    totalPaid: number
    pending: number
    credited: number
  }
  recentActivity: ActivityItem[]
  actionItems: Array<{ href: string; message: string; variant: StatusVariant }>
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

const startOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

const isToday = (dateString?: string | null) => {
  if (!dateString) return false
  return new Date(dateString).getTime() >= startOfToday()
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

const activityVariant = (kind: string): StatusVariant => {
  if (["delivered", "credited", "active"].includes(kind)) return "success"
  if (["return", "pending", "to_accept"].includes(kind)) return "warning"
  if (["reversed", "rejected"].includes(kind)) return "error"
  return "info"
}

function buildDashboardData(input: {
  products: any[]
  orders: any[]
  returns: any[]
  payoutSummary: any
  payoutTotals?: any
}): DashboardData {
  const { products, orders, returns, payoutSummary, payoutTotals } = input

  const active = products.filter(isActiveProduct).length
  const inactive = Math.max(products.length - active, 0)
  const pendingApproval = products.filter(
    (product) => String(product?.metadata?.approval_status || "").toLowerCase() === "pending"
  ).length

  const inTransitOrders = orders.filter((order) => orderStage(order) === "in_transit")
  const deliveredOrders = orders.filter((order) => orderStage(order) === "delivered")
  const toAcceptOrders = orders.filter((order) => orderStage(order) === "to_accept")
  const todayOrders = orders.filter((order) => isToday(order.created_at))
  const todayDeliveredOrders = deliveredOrders.filter((order) => isToday(order.updated_at || order.created_at))

  const totalSale = orders.reduce((sum, order) => sum + orderAmount(order), 0)
  const todaysSale = todayOrders.reduce((sum, order) => sum + orderAmount(order), 0)

  const inProgressReturns = returns.filter((request) =>
    ["approved", "pickup_initiated", "picked_up", "received", "pending_approval", "pending"].includes(
      String(request?.status || "").toLowerCase()
    )
  )
  const refundedReturns = returns.filter((request) =>
    ["refunded", "replaced", "closed"].includes(String(request?.status || "").toLowerCase())
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
      (stage === "to_accept"
        ? "Pending acceptance"
        : stage.replace(/_/g, " "))
    activity.push({
      id: `order-${order.id}-${stage}`,
      title: `Order ${order.display_id || String(order.id).slice(0, 10)}`,
      description: `${statusLabel} - ${formatCurrency(orderAmount(order))}`,
      href: "/orders",
      at: order.updated_at || order.created_at,
      variant: activityVariant(stage),
    })
  }

  for (const product of products) {
    const activeProduct = isActiveProduct(product)
    activity.push({
      id: `product-${product.id}`,
      title: product.title || "Product updated",
      description: activeProduct ? "Product active on ecommerce" : "Product inactive or awaiting approval",
      href: "/products",
      at: product.updated_at || product.created_at,
      variant: activeProduct ? "success" : "warning",
    })
  }

  for (const item of returns) {
    const status = String(item.status || "return").replace(/_/g, " ")
    activity.push({
      id: `return-${item.id}`,
      title: `Return ${item.order_display_id || String(item.order_id || "").slice(0, 10)}`,
      description: `${status}${item.reason ? ` - ${item.reason}` : ""}`,
      href: "/returns",
      at: item.updated_at || item.created_at,
      variant: activityVariant("return"),
    })
  }

  for (const item of payoutSummary?.unlocking || []) {
    activity.push({
      id: `payout-unlocking-${item.id}`,
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
      title: `Payout credited ${item.order_display_id || String(item.order_id).slice(0, 10)}`,
      description: `${formatCurrency(Number(item.net_amount || 0))} credited`,
      href: "/payout",
      at: item.credited_at,
      variant: "success",
    })
  }

  const actionItems: DashboardData["actionItems"] = []
  if (toAcceptOrders.length) {
    actionItems.push({
      href: "/orders",
      message: `${toAcceptOrders.length} order${toAcceptOrders.length === 1 ? "" : "s"} waiting to accept`,
      variant: "warning",
    })
  }
  if (pendingApproval) {
    actionItems.push({
      href: "/products",
      message: `${pendingApproval} product${pendingApproval === 1 ? "" : "s"} awaiting admin approval`,
      variant: "warning",
    })
  }
  if (pending > 0) {
    actionItems.push({
      href: "/payout",
      message: `${formatCurrency(pending)} payout pending`,
      variant: "info",
    })
  }
  if (inProgressReturns.length) {
    actionItems.push({
      href: "/returns",
      message: `${inProgressReturns.length} return${inProgressReturns.length === 1 ? "" : "s"} in progress`,
      variant: "warning",
    })
  }

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
      inTransitToday: inTransitOrders.filter((order) => isToday(order.updated_at || order.created_at)).length,
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
    sales: {
      total: totalSale,
      today: todaysSale,
    },
    payout: {
      totalPaid,
      pending,
      credited,
    },
    recentActivity: activity
      .filter((item) => item.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 12),
    actionItems,
  }
}

const KpiCard = ({ href, icon, label, value, helper, tone = "default", metrics }: KpiCardProps) => (
  <Link href={href} className="block text-inherit no-underline">
    <div
      className={clx(
        "group h-full rounded-xl border bg-ui-bg-base p-5 transition-all duration-200 hover:border-ui-border-strong hover:bg-ui-bg-subtle/40 hover:shadow-sm",
        tone === "hero"
          ? "border-oweg-500/25 bg-gradient-to-br from-oweg-500/[0.08] via-ui-bg-base to-ui-bg-base"
          : "border-ui-border-base/70"
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-oweg-500/10 text-oweg-700">
          {icon}
        </div>
        <ArrowUpRightMini className="text-ui-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ui-fg-base" />
      </div>
      <Text size="small" className="text-ui-fg-subtle">{label}</Text>
      <Heading level="h2" className="mt-1 text-2xl md:text-3xl">{value}</Heading>
      {helper && <Text size="small" className="mt-1 text-ui-fg-subtle">{helper}</Text>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-ui-border-base/60 bg-ui-bg-subtle/35 px-3 py-2">
            <span className="flex items-center gap-1.5">
              <StatusDot variant={metric.variant || "neutral"} />
              <Text size="xsmall" className="text-ui-fg-subtle">{metric.label}</Text>
            </span>
            <Text size="small" weight="plus" className="mt-1">{metric.value}</Text>
          </div>
        ))}
      </div>
    </div>
  </Link>
)

const VendorDashboardPage = () => {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [vendorInfo, setVendorInfo] = useState<VendorInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      router.push("/login")
      return
    }

    const loadDashboardData = async () => {
      try {
        setLoading(true)
        const [productsData, ordersData, returnsData, payoutData, profileData] = await Promise.all([
          vendorProductsApi.list().catch(() => ({ products: [] })),
          vendorOrdersApi.list().catch(() => ({ orders: [] })),
          vendorReturnsApi.list().catch(() => ({ return_requests: [] })),
          vendorPayoutsApi.list().catch(() =>
            vendorPayoutsApi.summary().then((summary) => ({
              ...summary,
              payouts: [],
              totals: { total_credited: 0 },
            }))
          ).catch(() => ({
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
    }

    void loadDashboardData()
  }, [router])

  const displayName = useMemo(
    () => vendorInfo?.name?.split(" ")[0] || vendorInfo?.email?.split("@")[0] || "there",
    [vendorInfo]
  )

  const storeLabel = vendorInfo?.store_name ? `${vendorInfo.store_name} Store` : "Vendor workspace"

  let content

  if (loading) {
    content = (
      <Container className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-56 animate-pulse rounded-lg bg-ui-bg-base-hover" />
            <div className="h-4 w-80 animate-pulse rounded-md bg-ui-bg-base-hover/70" />
          </div>
          <div className="h-10 w-40 animate-pulse rounded-lg bg-ui-bg-base-hover" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-xl bg-ui-bg-base-hover" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
          <div className="h-96 animate-pulse rounded-xl bg-ui-bg-base-hover" />
          <div className="h-96 animate-pulse rounded-xl bg-ui-bg-base-hover" />
        </div>
      </Container>
    )
  } else if (error) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      </Container>
    )
  } else if (data) {
    content = (
      <Container className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              {getTimeGreeting()}, {displayName}
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              {storeLabel} - live catalog, orders, returns, sales, and payout status.
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => router.push("/products/bulk-upload")}>
              Bulk Upload
            </Button>
            <Button variant="secondary" className="oweg-btn-primary" onClick={() => router.push("/products/new")}>
              <Plus />
              Create Product
            </Button>
          </div>
        </div>

        {data.actionItems.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.actionItems.map((item) => (
              <InsightPill key={item.message} href={item.href} message={item.message} variant={item.variant} />
            ))}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            href="/products"
            icon={<Tag />}
            label="Total Products Published"
            value={data.products.totalPublished}
            helper="Lifetime vendor catalog"
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
            helper={`${data.orders.today} today`}
            metrics={[
              { label: "In transit", value: `${data.orders.inTransit} (${data.orders.inTransitToday} today)`, variant: "info" },
              { label: "Delivered", value: `${data.orders.delivered} (${data.orders.deliveredToday} today)`, variant: "success" },
            ]}
          />
          <KpiCard
            href="/returns"
            icon={<ArrowPath />}
            label="Total Returns"
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
            label="Total Sale"
            value={formatCurrency(data.sales.total)}
            helper={`${formatCurrency(data.sales.today)} today`}
            tone="hero"
            metrics={[
              { label: "Orders today", value: data.orders.today, variant: "info" },
              { label: "To accept", value: data.orders.toAccept, variant: "warning" },
            ]}
          />
          <KpiCard
            href="/payout"
            icon={<ArchiveBox />}
            label="Total Payout"
            value={formatCurrency(data.payout.totalPaid)}
            helper="Processed/paid amount"
            metrics={[
              { label: "Pending", value: formatCurrency(data.payout.pending), variant: "warning" },
              { label: "Credited", value: formatCurrency(data.payout.credited), variant: "success" },
            ]}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <DashboardSection
            title="Recent Activity"
            action={{ label: "View orders", onClick: () => router.push("/orders") }}
          >
            {data.recentActivity.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base">
                <div className="divide-y divide-ui-border-base/70">
                  {data.recentActivity.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="group grid grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition hover:bg-ui-bg-subtle/60"
                    >
                      <StatusDot variant={item.variant} />
                      <div className="min-w-0">
                        <Text weight="plus" className="truncate">{item.title}</Text>
                        <Text size="small" className="truncate text-ui-fg-subtle">{item.description}</Text>
                      </div>
                      <div className="flex items-center gap-2">
                        <Text size="small" className="text-ui-fg-muted">{formatRelativeTime(item.at)}</Text>
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
                title="No activity yet"
                description="Orders, products, returns, and payout updates will appear here."
                primaryAction={{ label: "Create product", onClick: () => router.push("/products/new") }}
              />
            )}
          </DashboardSection>

          <div className="space-y-5">
            <DashboardSection title="Operational Focus">
              <div className="space-y-2.5">
                <FocusRow
                  href="/orders"
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
                  href="/products"
                  label="Inactive products"
                  value={data.products.inactive}
                  variant={data.products.inactive > 0 ? "warning" : "success"}
                />
              </div>
            </DashboardSection>

            <DashboardSection title="Quick Actions">
              <div className="grid gap-2.5">
                {[
                  { href: "/products/new", label: "Add product", icon: Plus },
                  { href: "/products", label: "Manage catalog", icon: Tag },
                  { href: "/orders", label: "Process orders", icon: ShoppingCart },
                  { href: "/returns", label: "Review returns", icon: ArrowPath },
                  { href: "/payout", label: "Check payout", icon: CurrencyDollar },
                ].map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group flex items-center gap-3 rounded-xl border border-ui-border-base/70 bg-ui-bg-base p-3 transition hover:border-ui-border-strong hover:bg-ui-bg-subtle/60"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ui-bg-base-hover text-ui-fg-muted">
                      <action.icon />
                    </span>
                    <Text weight="plus" className="min-w-0 flex-1">{action.label}</Text>
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
    className="flex items-center justify-between gap-3 rounded-xl border border-ui-border-base/70 bg-ui-bg-base px-4 py-3 transition hover:border-ui-border-strong hover:bg-ui-bg-subtle/60"
  >
    <span className="flex min-w-0 items-center gap-2">
      <StatusDot variant={variant} />
      <Text className="truncate">{label}</Text>
    </span>
    <Text weight="plus">{value}</Text>
  </Link>
)

export default VendorDashboardPage
