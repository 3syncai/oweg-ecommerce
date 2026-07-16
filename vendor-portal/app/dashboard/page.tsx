"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Button } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import EmptyState from "@/components/EmptyState"
import StatCard from "@/components/dashboard/StatCard"
import InsightPill from "@/components/dashboard/InsightPill"
import DashboardSection from "@/components/dashboard/DashboardSection"
import StatusDot, { fulfillmentStatusVariant } from "@/components/dashboard/StatusDot"
import {
  vendorProductsApi,
  vendorOrdersApi,
  vendorCustomersApi,
  vendorInventoryApi,
  vendorProfileApi,
  vendorPayoutsApi,
  vendorReturnsApi,
} from "@/lib/api/client"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ShoppingCart,
  CurrencyDollar,
  Users,
  ArchiveBox,
  Plus,
  ArrowUpRightMini,
  ArrowPath,
  Tag,
} from "@medusajs/icons"

type DashboardData = {
  totalProducts: number
  publishedProducts: number
  draftProducts: number
  pendingApprovalProducts: number
  totalOrders: number
  pendingOrders: number
  completedOrders: number
  totalReturns: number
  pendingReturns: number
  totalRevenue: number
  totalCustomers: number
  averageOrderValue: number
  recentOrders: any[]
  lowStockProducts: any[]
  topProducts: { product: string; orders: number }[]
  actionItems: { type: string; message: string; link: string; variant: "success" | "warning" | "info" }[]
}

type VendorInfo = {
  name?: string
  email?: string
  store_name?: string
}

const QUICK_ACTIONS = [
  {
    href: "/products",
    label: "Manage Products",
    description: "View and edit your catalog",
    icon: Tag,
  },
  {
    href: "/orders",
    label: "View Orders",
    description: "Process customer orders",
    icon: ShoppingCart,
  },
  {
    href: "/returns",
    label: "View Returns",
    description: "Track return requests",
    icon: ArrowPath,
  },
  {
    href: "/customers",
    label: "View Customers",
    description: "See who's buying from you",
    icon: Users,
  },
  {
    href: "/inventory",
    label: "Manage Inventory",
    description: "Update stock levels",
    icon: ArchiveBox,
  },
] as const

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

  // Boundaries in IST (Asia/Kolkata)
  if (hour >= 5 && hour < 12) return "Good morning"
  if (hour >= 12 && hour < 17) return "Good afternoon"
  if (hour >= 17 && hour < 22) return "Good evening"
  return "Good night"
}

const formatRelativeTime = (dateString: string) => {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(dateString).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
}

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

        const [
          productsData,
          ordersData,
          customersData,
          inventoryData,
          profileData,
          payoutData,
          returnsData,
        ] = await Promise.all([
            vendorProductsApi.list().catch(() => ({ products: [] })),
            vendorOrdersApi.list().catch(() => ({ orders: [] })),
            vendorCustomersApi.list().catch(() => ({ customers: [] })),
            vendorInventoryApi.list().catch(() => ({ inventory: [] })),
            vendorProfileApi.getMe().catch(() => ({ vendor: null })),
            vendorPayoutsApi.summary().catch(() => ({
              summary: {
                available_balance: 0,
                unlocking_balance: 0,
                total_credited: 0,
                total_withdrawn: 0,
                reversed_total: 0,
                unlocking: [],
                credited_recent: [],
                reversed_recent: [],
              },
            })),
            vendorReturnsApi.list().catch(() => ({ return_requests: [] })),
          ])

        setVendorInfo(profileData?.vendor || null)

        const products = productsData?.products || []
        const orders = ordersData?.orders || []
        const customers = customersData?.customers || []
        const inventory = inventoryData?.inventory || []
        const returnRequests = returnsData?.return_requests || []
        // Vendor list only includes admin-approved returns
        const pendingReturns = returnRequests.filter((r: any) =>
          ["approved", "pickup_initiated", "picked_up", "received"].includes(r.status)
        ).length

        const publishedProducts = products.filter(
          (p: any) =>
            p.status === "published" &&
            p.metadata?.approval_status !== "pending" &&
            p.metadata?.approval_status !== "rejected"
        ).length

        const pendingApprovalProducts = products.filter(
          (p: any) => p.metadata?.approval_status === "pending"
        ).length

        const draftProducts = products.filter((p: any) => p.status === "draft").length

        const pendingOrders = orders.filter(
          (o: any) =>
            o.fulfillment_status === "pending" || o.fulfillment_status === "processing"
        ).length

        const completedOrders = orders.filter(
          (o: any) =>
            o.fulfillment_status === "shipped" || o.fulfillment_status === "delivered"
        ).length

        const payoutSummary = payoutData?.summary
        const payoutBalance =
          (payoutSummary?.available_balance || 0) + (payoutSummary?.unlocking_balance || 0)
        const payoutOrderCount =
          (payoutSummary?.unlocking?.length || 0) +
          (payoutSummary?.credited_recent?.length || 0) +
          (payoutSummary?.reversed_recent?.length || 0)
        const totalRevenue = payoutBalance
        const avgOrderValue =
          payoutOrderCount > 0 ? payoutBalance / payoutOrderCount : 0

        const recentOrders = [
          ...(payoutSummary?.unlocking || []).map((item) => ({
            id: item.order_id,
            display_id: item.order_display_id,
            total: item.net_amount,
            fulfillment_status: "unlocking",
            created_at: item.delivered_at || item.unlock_at,
            email: "Payout unlocking",
          })),
          ...(payoutSummary?.credited_recent || []).map((item) => ({
            id: item.order_id,
            display_id: item.order_display_id,
            total: item.net_amount,
            fulfillment_status: "credited",
            created_at: item.credited_at,
            email: "Credited to payout",
          })),
          ...(payoutSummary?.reversed_recent || []).map((item) => ({
            id: item.order_id,
            display_id: item.order_display_id,
            total: item.net_amount,
            fulfillment_status: "reversed",
            created_at: item.reversed_at,
            email: "Order returned",
          })),
        ].slice(0, 5)

        const lowStockProducts = inventory
          .filter((item: any) => {
            const qty = item.available_quantity || item.stocked_quantity || 0
            return qty > 0 && qty < 10
          })
          .slice(0, 5)

        const productOrderCount = new Map<string, number>()
        if (payoutOrderCount > 0) {
          orders.forEach((order: any) => {
            ;(order.items || []).forEach((item: any) => {
              const title = item.title || "Unknown Product"
              productOrderCount.set(title, (productOrderCount.get(title) || 0) + 1)
            })
          })
        }

        const topProducts = Array.from(productOrderCount.entries())
          .map(([product, orderCount]) => ({ product, orders: orderCount }))
          .sort((a, b) => b.orders - a.orders)
          .slice(0, 5)

        const actionItems: DashboardData["actionItems"] = []

        if (pendingApprovalProducts > 0) {
          actionItems.push({
            type: "warning",
            variant: "warning",
            message: `${pendingApprovalProducts} product${pendingApprovalProducts > 1 ? "s" : ""} awaiting approval`,
            link: "/products",
          })
        }

        if (pendingOrders > 0) {
          actionItems.push({
            type: "info",
            variant: "warning",
            message: `${pendingOrders} pending order${pendingOrders > 1 ? "s" : ""} to process`,
            link: "/orders",
          })
        }

        if (pendingReturns > 0) {
          actionItems.push({
            type: "warning",
            variant: "warning",
            message: `${pendingReturns} return${pendingReturns > 1 ? "s" : ""} in progress`,
            link: "/returns",
          })
        }

        if (lowStockProducts.length > 0) {
          actionItems.push({
            type: "warning",
            variant: "warning",
            message: `${lowStockProducts.length} product${lowStockProducts.length > 1 ? "s" : ""} low on stock`,
            link: "/inventory",
          })
        }

        if (publishedProducts > 0) {
          actionItems.push({
            type: "success",
            variant: "success",
            message: `${publishedProducts} live product${publishedProducts > 1 ? "s" : ""} visible to customers`,
            link: "/products",
          })
        }

        setData({
          totalProducts: products.length,
          publishedProducts,
          draftProducts,
          pendingApprovalProducts,
          totalOrders: orders.length,
          pendingOrders,
          completedOrders,
          totalReturns: returnRequests.length,
          pendingReturns,
          totalRevenue,
          totalCustomers: customers.length,
          averageOrderValue: avgOrderValue,
          recentOrders,
          lowStockProducts,
          topProducts,
          actionItems,
        })
      } catch (e: any) {
        if (e.status === 403) {
          router.push("/pending")
          return
        }
        setError(e?.message || "Failed to load dashboard")
        console.error("Dashboard error:", e)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [router])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

  const displayName =
    vendorInfo?.name?.split(" ")[0] ||
    vendorInfo?.email?.split("@")[0] ||
    "there"

  const storeLabel = vendorInfo?.store_name ? `${vendorInfo.store_name} Store` : null

  let content

  if (loading) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded-lg bg-ui-bg-base-hover animate-pulse" />
            <div className="h-4 w-72 rounded-md bg-ui-bg-base-hover/70 animate-pulse" />
          </div>
          <div className="h-9 w-36 rounded-lg bg-ui-bg-base-hover animate-pulse" />
        </div>

        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-10 w-52 rounded-full bg-ui-bg-base-hover animate-pulse"
            />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="h-36 rounded-xl bg-ui-bg-base-hover animate-pulse lg:col-span-2" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-ui-bg-base-hover animate-pulse" />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-ui-border-base/70 bg-ui-bg-base p-5 space-y-4"
            >
              <div className="h-5 w-36 rounded-md bg-ui-bg-base-hover animate-pulse" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} className="h-14 rounded-lg bg-ui-bg-base-hover/70 animate-pulse" />
                ))}
              </div>
            </div>
          ))}
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
      <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        {/* Header */}
        <div
          className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4"
          style={{ animationDelay: "0ms" }}
        >
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              {getTimeGreeting()}, {displayName}
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              {storeLabel
                ? `${storeLabel} · Here's your store at a glance`
                : "Here's what's happening with your store"}
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => router.push("/products/bulk-upload")}>
              Bulk Upload
            </Button>
            <Button variant="secondary" className="oweg-btn-primary" onClick={() => router.push("/products/new")}>
              <Plus />
              Create Product
            </Button>
          </div>
        </div>

        {/* Insight pills */}
        {data.actionItems.length > 0 && (
          <div
            className="animate-fade-in-up flex flex-wrap gap-2"
            style={{ animationDelay: "40ms" }}
          >
            {data.actionItems.map((item, idx) => (
              <InsightPill
                key={idx}
                href={item.link}
                message={item.message}
                variant={item.variant}
                style={{ animationDelay: `${60 + idx * 30}ms` }}
              />
            ))}
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            variant="hero"
            icon={<CurrencyDollar />}
            label="Available payout"
            value={formatCurrency(data.totalRevenue)}
            style={{ animationDelay: "80ms" }}
            className="animate-fade-in-up-slow"
            subtext={
              <Text className="text-ui-fg-subtle">
                Credited after delivery + 5-minute unlock
              </Text>
            }
          />

          <StatCard
            icon={<ShoppingCart />}
            label="Orders"
            value={data.totalOrders}
            style={{ animationDelay: "120ms" }}
            className="animate-fade-in-up-slow"
            subtext={
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                  <StatusDot variant="warning" />
                  <Text size="small">{data.pendingOrders} pending</Text>
                </span>
                <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                  <StatusDot variant="success" />
                  <Text size="small">{data.completedOrders} done</Text>
                </span>
              </div>
            }
          />

          <StatCard
            icon={<Users />}
            label="Customers"
            value={data.totalCustomers}
            style={{ animationDelay: "160ms" }}
            className="animate-fade-in-up-slow"
            subtext={<Text className="text-ui-fg-subtle">Unique buyers</Text>}
          />

          <StatCard
            icon={<ArchiveBox />}
            label="Products"
            value={data.totalProducts}
            style={{ animationDelay: "200ms" }}
            className="animate-fade-in-up-slow"
            subtext={
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                  <StatusDot variant="success" />
                  <Text size="small">{data.publishedProducts} live</Text>
                </span>
                {data.pendingApprovalProducts > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                    <StatusDot variant="warning" />
                    <Text size="small">{data.pendingApprovalProducts} pending</Text>
                  </span>
                )}
              </div>
            }
          />

          <Link href="/returns" className="block text-inherit no-underline">
            <StatCard
              icon={<ArrowPath />}
              label="Returns"
              value={data.totalReturns ?? 0}
              style={{ animationDelay: "240ms" }}
              className="animate-fade-in-up-slow h-full"
              subtext={
                <div className="flex flex-wrap gap-3">
                  {(data.pendingReturns ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                      <StatusDot variant="warning" />
                      <Text size="small">{data.pendingReturns} in progress</Text>
                    </span>
                  ) : (
                    <Text className="text-ui-fg-subtle">Admin-approved returns</Text>
                  )}
                </div>
              }
            />
          </Link>
        </div>

        {/* Lists + quick actions */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <DashboardSection
              title="Recent payout activity"
              action={
                data.recentOrders.length > 0
                  ? { label: "View payout", onClick: () => router.push("/payout") }
                  : undefined
              }
              style={{ animationDelay: "240ms" }}
            >
              {data.recentOrders.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base divide-y divide-ui-border-base/70">
                  {data.recentOrders.map((order: any) => {
                    const status = order.fulfillment_status || "pending"

                    return (
                      <Link
                        key={order.id}
                        href="/payout"
                        className="group flex items-center justify-between gap-4 p-4 transition-all duration-200 hover:bg-ui-bg-subtle/80"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Text weight="plus" className="truncate">
                              #{order.display_id || order.id.slice(0, 8)}
                            </Text>
                            {order.created_at && (
                              <Text size="xsmall" className="shrink-0 text-ui-fg-muted">
                                {formatRelativeTime(order.created_at)}
                              </Text>
                            )}
                          </div>
                          <Text size="small" className="truncate text-ui-fg-subtle">
                            {order.email}
                          </Text>
                        </div>
                        <div className="flex shrink-0 items-center gap-4">
                          <span className="inline-flex items-center gap-1.5">
                            <StatusDot variant={fulfillmentStatusVariant(status)} />
                            <Text size="small" className="capitalize text-ui-fg-subtle">
                              {status}
                            </Text>
                          </span>
                          <Text
                            weight="plus"
                            className={`min-w-[80px] text-right ${
                              status === "reversed" ? "text-red-600" : status === "credited" ? "text-emerald-600" : ""
                            }`}
                          >
                            {status === "credited" ? "+" : ""}
                            {formatCurrency(order.total || 0)}
                          </Text>
                          <ArrowUpRightMini className="hidden text-ui-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ui-fg-base sm:block" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <EmptyState
                  accent="blue"
                  icon={<ShoppingCart />}
                  title="No payout activity yet"
                  description="Delivered orders appear here after the 5-minute unlock period."
                  primaryAction={{
                    label: "View orders",
                    onClick: () => router.push("/orders"),
                  }}
                />
              )}
            </DashboardSection>

            {data.topProducts.length > 0 && (
              <DashboardSection title="Top Selling Products" style={{ animationDelay: "280ms" }}>
                <div className="overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base divide-y divide-ui-border-base/70">
                  {data.topProducts.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-ui-bg-subtle/50"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ui-bg-base-hover text-sm font-semibold text-ui-fg-subtle">
                          {idx + 1}
                        </div>
                        <Text weight="plus" className="truncate">
                          {item.product}
                        </Text>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5">
                        <StatusDot variant="info" />
                        <Text size="small" className="text-ui-fg-subtle">
                          {item.orders} order{item.orders > 1 ? "s" : ""}
                        </Text>
                      </span>
                    </div>
                  ))}
                </div>
              </DashboardSection>
            )}

            {data.lowStockProducts.length > 0 && (
              <DashboardSection
                title="Low Stock Alert"
                action={{ label: "Manage", onClick: () => router.push("/inventory") }}
                style={{ animationDelay: "320ms" }}
              >
                <div className="overflow-hidden rounded-xl border border-orange-500/20 bg-orange-500/[0.04] divide-y divide-orange-500/10">
                  {data.lowStockProducts.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <Text weight="plus" className="truncate">
                          {item.product_title}
                        </Text>
                        <Text size="small" className="text-ui-fg-subtle">
                          {item.variant_title}
                        </Text>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5">
                        <StatusDot variant="warning" />
                        <Text size="small" className="text-ui-fg-subtle">
                          {item.available_quantity || item.stocked_quantity} left
                        </Text>
                      </span>
                    </div>
                  ))}
                </div>
              </DashboardSection>
            )}
          </div>

          {/* Quick actions sidebar */}
          <DashboardSection title="Quick Actions" style={{ animationDelay: "260ms" }}>
            <div className="grid grid-cols-1 gap-2.5">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex items-center gap-3 rounded-xl border border-ui-border-base/70 bg-ui-bg-base p-4 transition-all duration-200 hover:border-ui-border-strong hover:bg-ui-bg-subtle/60 hover:shadow-sm"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ui-bg-base-hover text-ui-fg-muted transition-colors group-hover:bg-ui-bg-subtle group-hover:text-ui-fg-base">
                    <action.icon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Text weight="plus" className="text-ui-fg-base">
                      {action.label}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {action.description}
                    </Text>
                  </div>
                  <ArrowUpRightMini className="shrink-0 text-ui-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ui-fg-base" />
                </Link>
              ))}
            </div>
          </DashboardSection>
        </div>
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorDashboardPage
