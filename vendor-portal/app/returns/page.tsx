"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Container, Heading, Text } from "@medusajs/ui"
import { ArrowPath, MagnifyingGlass } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import EmptyState from "@/components/EmptyState"
import StatCard from "@/components/dashboard/StatCard"
import StatusDot, { returnStatusVariant } from "@/components/dashboard/StatusDot"
import { vendorReturnsApi, type VendorReturnRequest } from "@/lib/api/client"
import { useRouter } from "next/navigation"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

const formatStatus = (status?: string) =>
  (status || "unknown").replace(/_/g, " ")

type StatusFilter =
  | "all"
  | "pending_approval"
  | "approved"
  | "in_transit"
  | "refunded"
  | "rejected"

const VendorReturnsPage = () => {
  const router = useRouter()
  const [returns, setReturns] = useState<VendorReturnRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const loadReturns = useCallback(async () => {
    try {
      const data = await vendorReturnsApi.list()
      setReturns(data?.return_requests || [])
      setError(null)
    } catch (e: any) {
      if (e.status === 403) {
        router.push("/pending")
        return
      }
      setError(e?.message || "Failed to load returns")
      console.error("Returns error:", e)
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

    void loadReturns()
  }, [router, loadReturns])

  const stats = useMemo(() => {
    let pending = 0
    let approved = 0
    let refunded = 0
    let rejected = 0

    returns.forEach((item) => {
      const status = item.status || ""
      if (status === "pending_approval") pending += 1
      else if (
        status === "approved" ||
        status === "pickup_initiated" ||
        status === "picked_up" ||
        status === "received"
      ) {
        approved += 1
      } else if (status === "refunded" || status === "replaced" || status === "closed") {
        refunded += 1
      } else if (status === "rejected") {
        rejected += 1
      }
    })

    return { total: returns.length, pending, approved, refunded, rejected }
  }, [returns])

  const filteredReturns = useMemo(() => {
    const query = search.trim().toLowerCase()

    return returns.filter((item) => {
      const status = item.status || ""

      if (statusFilter === "pending_approval" && status !== "pending_approval") return false
      if (statusFilter === "approved") {
        if (!["approved", "pickup_initiated", "picked_up", "received"].includes(status)) {
          return false
        }
      }
      if (statusFilter === "in_transit") {
        if (!["pickup_initiated", "picked_up"].includes(status)) return false
      }
      if (statusFilter === "refunded") {
        if (!["refunded", "replaced", "closed"].includes(status)) return false
      }
      if (statusFilter === "rejected" && status !== "rejected") return false

      if (!query) return true

      const orderId = String(item.order_display_id || item.order_id)
      const itemTitles = (item.vendor_items || []).map((line) => line.title).join(" ")

      return (
        orderId.toLowerCase().includes(query) ||
        item.customer_email?.toLowerCase().includes(query) ||
        item.customer_name?.toLowerCase().includes(query) ||
        item.reason?.toLowerCase().includes(query) ||
        itemTitles.toLowerCase().includes(query)
      )
    })
  }, [returns, search, statusFilter])

  const filterOptions = [
    { value: "all" as const, label: "All", count: stats.total },
    { value: "pending_approval" as const, label: "Pending", count: stats.pending },
    { value: "approved" as const, label: "In progress", count: stats.approved },
    {
      value: "in_transit" as const,
      label: "Pickup",
      count: returns.filter((r) =>
        ["pickup_initiated", "picked_up"].includes(r.status || "")
      ).length,
    },
    { value: "refunded" as const, label: "Closed", count: stats.refunded },
    { value: "rejected" as const, label: "Rejected", count: stats.rejected },
  ]

  let content

  if (loading) {
    content = <PageSkeleton label="Loading returns…" stats={4} rows={6} cols={6} showAction={false} />
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
              Returns
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              {stats.total > 0
                ? `${stats.total} return request${stats.total === 1 ? "" : "s"} · ${stats.pending} pending approval`
                : "Return and replacement requests for your products"}
            </Text>
          </div>
        </div>

        {returns.length === 0 ? (
          <EmptyState
            accent="oweg"
            icon={<ArrowPath />}
            title="No returns yet"
            description="When a customer requests a return or replacement on one of your orders, it will appear here."
            primaryAction={{ label: "View orders", onClick: () => router.push("/orders") }}
            secondaryAction={{ label: "Go to dashboard", onClick: () => router.push("/dashboard") }}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in-up-slow">
              <StatCard
                icon={<ArrowPath />}
                label="Total returns"
                value={stats.total}
                subtext={<Text className="text-ui-fg-subtle">All requests</Text>}
              />
              <StatCard
                icon={<ArrowPath />}
                label="Pending approval"
                value={stats.pending}
                subtext={
                  <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                    <StatusDot variant="warning" />
                    <Text size="small">Awaiting admin</Text>
                  </span>
                }
              />
              <StatCard
                icon={<ArrowPath />}
                label="In progress"
                value={stats.approved}
                subtext={
                  <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                    <StatusDot variant="info" />
                    <Text size="small">Approved / pickup</Text>
                  </span>
                }
              />
              <StatCard
                variant="hero"
                icon={<ArrowPath />}
                label="Closed / refunded"
                value={stats.refunded}
                subtext={
                  <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                    <StatusDot variant="success" />
                    <Text size="small">Completed</Text>
                  </span>
                }
              />
            </div>

            <div className="animate-fade-in-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-fg-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by order, customer, or reason…"
                  className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ui-fg-muted focus:border-ui-border-strong"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      statusFilter === option.value
                        ? "border-oweg-500/40 bg-oweg-500/10 text-oweg-800 dark:text-oweg-300"
                        : "border-ui-border-base/70 bg-ui-bg-base text-ui-fg-subtle hover:bg-ui-bg-subtle"
                    }`}
                  >
                    {option.label} ({option.count})
                  </button>
                ))}
              </div>
            </div>

            {filteredReturns.length === 0 ? (
              <EmptyState
                accent="gray"
                icon={<MagnifyingGlass />}
                title="No matching returns"
                description={
                  search
                    ? `No returns match "${search}".`
                    : "No returns in this status filter."
                }
                primaryAction={{
                  label: "Clear filters",
                  onClick: () => {
                    setSearch("")
                    setStatusFilter("all")
                  },
                }}
              />
            ) : (
              <>
                <div className="animate-fade-in-up overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base">
                  <div className="hidden lg:grid lg:grid-cols-[100px_minmax(0,1.2fr)_120px_140px_minmax(0,1fr)_110px] lg:gap-4 border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
                    {["Order", "Customer", "Type", "Status", "Reason / items", "Requested"].map(
                      (h) => (
                        <Text key={h} size="small" weight="plus" className="text-ui-fg-subtle">
                          {h}
                        </Text>
                      )
                    )}
                  </div>
                  <div className="divide-y divide-ui-border-base/70">
                    {filteredReturns.map((item) => {
                      const productLabels =
                        item.vendor_items?.length > 0
                          ? item.vendor_items
                              .map((line) => `${line.title} ×${line.quantity}`)
                              .join(", ")
                          : item.reason || "—"

                      return (
                        <div
                          key={item.id}
                          className="grid grid-cols-1 gap-2 px-4 py-4 transition-colors hover:bg-ui-bg-subtle/60 lg:grid-cols-[100px_minmax(0,1.2fr)_120px_140px_minmax(0,1fr)_110px] lg:items-center lg:gap-4"
                        >
                          <Text weight="plus">
                            #{item.order_display_id || item.order_id.slice(0, 8)}
                          </Text>
                          <div className="min-w-0">
                            <Text size="small" className="truncate">
                              {item.customer_name || "Customer"}
                            </Text>
                            <Text size="small" className="truncate text-ui-fg-subtle">
                              {item.customer_email || "—"}
                            </Text>
                          </div>
                          <Text size="small" className="capitalize">
                            {item.type || "return"}
                          </Text>
                          <span className="inline-flex items-center gap-1.5 capitalize">
                            <StatusDot variant={returnStatusVariant(item.status)} />
                            <Text size="small">{formatStatus(item.status)}</Text>
                          </span>
                          <div className="min-w-0">
                            <Text size="small" className="line-clamp-2">
                              {productLabels}
                            </Text>
                            {item.rejection_reason ? (
                              <Text size="xsmall" className="mt-0.5 text-red-600">
                                Rejected: {item.rejection_reason}
                              </Text>
                            ) : null}
                            {typeof item.order_total === "number" ? (
                              <Text size="xsmall" className="mt-0.5 text-ui-fg-muted">
                                Order {formatCurrency(item.order_total)}
                              </Text>
                            ) : null}
                          </div>
                          <Text size="small" className="text-ui-fg-subtle">
                            {formatDate(item.created_at)}
                          </Text>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <Text size="small" className="text-ui-fg-muted">
                  Showing {filteredReturns.length} of {returns.length} returns
                </Text>
              </>
            )}
          </>
        )}
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorReturnsPage
