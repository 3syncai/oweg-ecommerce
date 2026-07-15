"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Container, Heading, Text, Button } from "@medusajs/ui"
import { MagnifyingGlass, ShoppingCart } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import EmptyState from "@/components/EmptyState"
import StatCard from "@/components/dashboard/StatCard"
import StatusDot, { fulfillmentStatusVariant } from "@/components/dashboard/StatusDot"
import PayoutUnlockTimer from "@/components/PayoutUnlockTimer"
import { vendorOrdersApi, vendorPayoutsApi, type VendorOrderEarning } from "@/lib/api/client"
import { useRouter } from "next/navigation"

type Order = {
  id: string
  display_id?: string
  email?: string
  status: string
  fulfillment_status?: string
  total: any
  created_at: string
  items?: Array<{ id: string; title: string; quantity: number }>
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

const VendorOrdersPage = () => {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [earningsByOrder, setEarningsByOrder] = useState<Record<string, VendorOrderEarning>>({})
  const [payoutBalance, setPayoutBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "delivered" | "shipped">("all")

  const loadOrders = useCallback(async () => {
    try {
      const [data, payoutData] = await Promise.all([
        vendorOrdersApi.list(),
        vendorPayoutsApi.summary().catch(() => null),
      ])
      const nextOrders = data?.orders || []
      setOrders(nextOrders)

      const summary = payoutData?.summary
      setPayoutBalance(
        (summary?.available_balance || 0) + (summary?.unlocking_balance || 0)
      )

      const deliveredIds = nextOrders
        .filter((order) => order.fulfillment_status === "delivered")
        .map((order) => order.id)

      if (deliveredIds.length > 0) {
        const earningsData = await vendorPayoutsApi
          .earningsByOrders(deliveredIds)
          .catch(() => ({ earnings: {} as Record<string, VendorOrderEarning> }))
        setEarningsByOrder(earningsData.earnings || {})
      } else {
        setEarningsByOrder({})
      }
    } catch (e: any) {
      if (e.status === 403) {
        router.push("/pending")
        return
      }
      setError(e?.message || "Failed to load orders")
      console.error("Orders error:", e)
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
    const hasUnlocking = Object.values(earningsByOrder).some(
      (earning) => earning?.status === "UNLOCKING" && earning.unlock_at
    )
    if (!hasUnlocking) return

    const intervalId = window.setInterval(() => {
      void loadOrders()
    }, 15000)

    return () => window.clearInterval(intervalId)
  }, [earningsByOrder, loadOrders])

  const stats = useMemo(() => {
    let pending = 0
    let completed = 0

    orders.forEach((order) => {
      const status = order.fulfillment_status || "pending"
      if (status === "pending" || status === "processing") pending += 1
      if (status === "shipped" || status === "delivered") completed += 1
    })

    return { total: orders.length, pending, completed, revenue: payoutBalance }
  }, [orders, payoutBalance])

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase()

    return orders.filter((order) => {
      const status = order.fulfillment_status || "pending"
      if (statusFilter === "pending" && status !== "pending" && status !== "processing") return false
      if (statusFilter === "delivered" && status !== "delivered") return false
      if (statusFilter === "shipped" && status !== "shipped") return false
      if (!query) return true

      const id = String(order.display_id || order.id)
      return (
        id.toLowerCase().includes(query) ||
        order.email?.toLowerCase().includes(query)
      )
    })
  }, [orders, search, statusFilter])

  const filterOptions = [
    { value: "all" as const, label: "All", count: stats.total },
    { value: "pending" as const, label: "Pending", count: stats.pending },
    { value: "shipped" as const, label: "Shipped", count: orders.filter((o) => o.fulfillment_status === "shipped").length },
    { value: "delivered" as const, label: "Delivered", count: orders.filter((o) => o.fulfillment_status === "delivered").length },
  ]

  let content

  if (loading) {
    content = <PageSkeleton label="Loading orders…" stats={4} rows={8} cols={5} showAction={false} />
  } else if (error) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      </Container>
    )
  } else {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        <div className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              Orders
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              {stats.total > 0
                ? `${stats.total} orders · ${stats.pending} pending · ${formatCurrency(stats.revenue)} available payout`
                : "Manage your customer orders"}
            </Text>
          </div>
        </div>

        {orders.length === 0 ? (
          <EmptyState
            accent="oweg"
            icon={<ShoppingCart />}
            title="No orders yet"
            description="When customers place an order for your products, they'll show up here."
            primaryAction={{ label: "View products", onClick: () => router.push("/products") }}
            secondaryAction={{ label: "Go to dashboard", onClick: () => router.push("/dashboard") }}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4 animate-fade-in-up-slow">
              <StatCard icon={<ShoppingCart />} label="Total orders" value={stats.total} subtext={<Text className="text-ui-fg-subtle">All time</Text>} />
              <StatCard
                icon={<ShoppingCart />}
                label="Pending"
                value={stats.pending}
                subtext={
                  <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                    <StatusDot variant="warning" />
                    <Text size="small">Needs action</Text>
                  </span>
                }
              />
              <StatCard
                icon={<ShoppingCart />}
                label="Completed"
                value={stats.completed}
                subtext={
                  <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                    <StatusDot variant="success" />
                    <Text size="small">Shipped or delivered</Text>
                  </span>
                }
              />
              <StatCard
                variant="hero"
                icon={<ShoppingCart />}
                label="Available payout"
                value={formatCurrency(stats.revenue)}
                subtext={<Text className="text-ui-fg-subtle">After delivery unlock</Text>}
              />
            </div>

            <div className="animate-fade-in-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-fg-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search order # or email…"
                  className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ui-fg-muted focus:border-ui-border-strong"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-all duration-200 ${
                      statusFilter === option.value
                        ? "border-ui-border-strong bg-ui-bg-subtle text-ui-fg-base"
                        : "border-ui-border-base/70 text-ui-fg-subtle hover:border-ui-border-strong hover:text-ui-fg-base"
                    }`}
                  >
                    {option.label}
                    <span className="ml-1.5 text-ui-fg-muted">({option.count})</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="animate-fade-in-up overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base">
              {filteredOrders.length === 0 ? (
                <div className="p-10 text-center">
                  <Text className="text-ui-fg-subtle">No orders match your search or filter.</Text>
                  <Button variant="transparent" className="mt-3" onClick={() => { setSearch(""); setStatusFilter("all") }}>
                    Clear filters
                  </Button>
                </div>
              ) : (
                <>
                  <div className="hidden md:grid md:grid-cols-[100px_minmax(0,1fr)_120px_140px_160px_100px] md:gap-4 border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
                    {["Order", "Customer", "Date", "Status", "Payout", "Total"].map((h) => (
                      <Text key={h} size="small" weight="plus" className={`text-ui-fg-subtle ${h === "Total" ? "text-right" : ""}`}>
                        {h}
                      </Text>
                    ))}
                  </div>
                  <div className="divide-y divide-ui-border-base/70">
                    {filteredOrders.map((order) => {
                      const orderTotal = typeof order.total === "number" ? order.total : order.total?.amount || 0
                      const status = order.fulfillment_status || "pending"
                      const earning = earningsByOrder[order.id]

                      return (
                        <div
                          key={order.id}
                          className="grid grid-cols-1 gap-2 px-4 py-4 transition-colors hover:bg-ui-bg-subtle/60 md:grid-cols-[100px_minmax(0,1fr)_120px_140px_160px_100px] md:items-center md:gap-4"
                        >
                          <Text weight="plus">#{order.display_id || order.id.slice(0, 8)}</Text>
                          <div className="min-w-0 md:contents">
                            <Text size="small" className="truncate">{order.email || "N/A"}</Text>
                            <Text size="small" className="text-ui-fg-subtle">{formatDate(order.created_at)}</Text>
                            <span className="inline-flex items-center gap-1.5 capitalize">
                              <StatusDot variant={fulfillmentStatusVariant(status)} />
                              <Text size="small">{status}</Text>
                            </span>
                            <div className="min-h-7">
                              {status === "delivered" && earning?.status === "UNLOCKING" && earning.unlock_at ? (
                                <PayoutUnlockTimer
                                  unlockAt={earning.unlock_at}
                                  onComplete={() => void loadOrders()}
                                />
                              ) : status === "delivered" && earning?.status === "CREDITED" ? (
                                <Text size="small" className="text-emerald-600 font-medium">
                                  +{formatCurrency(earning.net_amount)}
                                </Text>
                              ) : earning?.status === "REVERSED" ? (
                                <Text size="small" className="text-ui-fg-muted">
                                  ₹0 · cancelled
                                </Text>
                              ) : (
                                <Text size="small" className="text-ui-fg-muted">—</Text>
                              )}
                            </div>
                            <Text weight="plus" className="md:text-right">{formatCurrency(orderTotal)}</Text>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            <Text size="small" className="text-ui-fg-muted">
              Showing {filteredOrders.length} of {orders.length} orders
            </Text>
          </>
        )}
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorOrdersPage
