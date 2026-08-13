"use client"

import { useCallback, useEffect, useState } from "react"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { ArrowPath, MagnifyingGlass, ChevronLeft, ChevronRight } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import EmptyState from "@/components/EmptyState"
import StatCard from "@/components/dashboard/StatCard"
import StatusDot, { returnStatusVariant } from "@/components/dashboard/StatusDot"
import {
  vendorReturnsApi,
  type VendorReturnCourier,
  type VendorReturnRequest,
} from "@/lib/api/client"
import { notifyVendorDataChanged, useVendorLive } from "@/lib/useVendorLive"
import { hasPageCache, pageCacheKey, peekPageCache, writePageCache } from "@/lib/page-cache"
import PageLoader from "@/components/PageLoader"
import { useRouter } from "next/navigation"

const PAGE_SIZE = 10
const RETURNS_ROUTE = "returns"

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

type StatusFilter = "all" | "pending" | "approved" | "in_transit" | "refunded"

type ReturnCounts = {
  total: number
  pending_approval: number
  in_progress: number
  pickup: number
  refunded: number
  needs_logistics: number
}

const EMPTY_COUNTS: ReturnCounts = {
  total: 0,
  pending_approval: 0,
  in_progress: 0,
  pickup: 0,
  refunded: 0,
  needs_logistics: 0,
}

type ReturnsCachePayload = {
  returns: VendorReturnRequest[]
  counts: ReturnCounts
  totalFiltered: number
}

const parseReturnsPayload = (data: Awaited<ReturnType<typeof vendorReturnsApi.list>>): ReturnsCachePayload => {
  const nextReturns = data?.return_requests || []
  const nextCounts: ReturnCounts = data?.counts
    ? {
        total: Number(data.counts.total) || 0,
        pending_approval: Number(data.counts.pending_approval) || 0,
        in_progress: Number(data.counts.in_progress) || 0,
        pickup: Number((data.counts as any).pickup) || 0,
        refunded: Number((data.counts as any).refunded) || 0,
        needs_logistics: Number((data.counts as any).needs_logistics) || 0,
      }
    : { ...EMPTY_COUNTS }
  return {
    returns: nextReturns,
    counts: nextCounts,
    totalFiltered: typeof data?.count === "number" ? data.count : nextReturns.length,
  }
}

const VendorReturnsPage = () => {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [page, setPage] = useState(1)

  const returnsCacheKey = pageCacheKey(RETURNS_ROUTE, {
    status: statusFilter,
    page,
    q: searchDebounced || undefined,
  })
  const cached = peekPageCache<ReturnsCachePayload>(returnsCacheKey)

  const [returns, setReturns] = useState<VendorReturnRequest[]>(() => cached?.returns ?? [])
  const [counts, setCounts] = useState<ReturnCounts>(() => cached?.counts ?? EMPTY_COUNTS)
  const [totalFiltered, setTotalFiltered] = useState(() => cached?.totalFiltered ?? 0)
  const [loading, setLoading] = useState(() => !hasPageCache(returnsCacheKey))
  const [error, setError] = useState<string | null>(null)
  const [activeReturnId, setActiveReturnId] = useState<string | null>(null)
  const [couriers, setCouriers] = useState<VendorReturnCourier[]>([])
  const [couriersLoading, setCouriersLoading] = useState(false)
  const [courierError, setCourierError] = useState<string | null>(null)
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null)
  const [reverseProviderLabel, setReverseProviderLabel] = useState("ITL")
  const [savingCourier, setSavingCourier] = useState(false)
  const [selfTrackingReturn, setSelfTrackingReturn] = useState<VendorReturnRequest | null>(
    null
  )
  const [selfTrackingForm, setSelfTrackingForm] = useState({
    courier_partner: "",
    tracking_number: "",
    tracking_url: "",
  })
  const [savingSelfTracking, setSavingSelfTracking] = useState(false)
  const [selfTrackingError, setSelfTrackingError] = useState<string | null>(null)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => setSearchDebounced(search.trim()), 300)
    return () => window.clearTimeout(id)
  }, [search])

  const loadReturns = useCallback(async () => {
    const cacheKey = pageCacheKey(RETURNS_ROUTE, {
      status: statusFilter,
      page,
      q: searchDebounced || undefined,
    })
    const hit = peekPageCache<ReturnsCachePayload>(cacheKey)
    if (hit) {
      setReturns(hit.returns)
      setCounts(hit.counts)
      setTotalFiltered(hit.totalFiltered)
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
      const data = await vendorReturnsApi.list({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        status: statusFilter === "all" ? undefined : statusFilter,
        q: searchDebounced || undefined,
      })
      const payload = parseReturnsPayload(data)
      setReturns(payload.returns)
      setCounts(payload.counts)
      setTotalFiltered(payload.totalFiltered)
      writePageCache(cacheKey, payload)
      setError(null)
    } catch (e: any) {
      if (e.status === 403) {
        router.push("/pending")
        return
      }
      if (e.status === 404 || /cannot get \/vendor\/returns/i.test(String(e?.message || ""))) {
        setError(
          "Returns API is not available on the production backend yet. Redeploy the Medusa server so GET /vendor/returns is live."
        )
      } else {
        setError(e?.message || "Failed to load returns")
      }
      console.error("Returns error:", e)
    } finally {
      setLoading(false)
    }
  }, [router, page, statusFilter, searchDebounced])

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      router.push("/login")
      return
    }

    void loadReturns()
  }, [router, loadReturns])

  useVendorLive({
    onInvalidate: () => {
      void loadReturns()
    },
  })

  useEffect(() => {
    setPage(1)
  }, [statusFilter, searchDebounced])

  const openCourierPicker = async (returnId: string) => {
    setActiveReturnId(returnId)
    setCouriers([])
    setSelectedCourierId(null)
    setCourierError(null)
    setReverseProviderLabel("ITL")
    setCouriersLoading(true)
    try {
      const data = await vendorReturnsApi.listCouriers(returnId)
      setCouriers(data.couriers || [])
      setReverseProviderLabel(
        String((data as any).provider_label || (data as any).provider || "ITL").trim() ||
          "ITL"
      )
      if (!data.couriers?.length) {
        setCourierError("No reverse courier services available for this pincode pair.")
      }
    } catch (e: any) {
      setCourierError(e?.message || "Failed to load reverse courier services")
    } finally {
      setCouriersLoading(false)
    }
  }

  const confirmCourier = async () => {
    if (!activeReturnId || selectedCourierId == null) return
    const chosen = couriers.find((c) => c.courier_id === selectedCourierId)
    if (!chosen) return

    setSavingCourier(true)
    setCourierError(null)
    try {
      await vendorReturnsApi.selectCourier(activeReturnId, {
        courier_id: chosen.courier_id,
        courier_name: chosen.courier_name,
        rate: chosen.rate != null ? Number(chosen.rate) : undefined,
        freight_charge:
          chosen.freight_charge != null ? Number(chosen.freight_charge) : undefined,
      })
      setActiveReturnId(null)
      await loadReturns()
      notifyVendorDataChanged()
    } catch (e: any) {
      setCourierError(e?.message || "Failed to save courier")
    } finally {
      setSavingCourier(false)
    }
  }

  const openSelfTracking = (item: VendorReturnRequest) => {
    setSelfTrackingReturn(item)
    setSelfTrackingError(null)
    setSelfTrackingForm({
      courier_partner: item.reverse_courier_partner || "",
      tracking_number: item.reverse_tracking_number || item.shiprocket_awb || "",
      tracking_url: item.reverse_tracking_url || "",
    })
  }

  const saveSelfTracking = async () => {
    if (!selfTrackingReturn) return
    if (
      !selfTrackingForm.courier_partner.trim() ||
      !selfTrackingForm.tracking_number.trim() ||
      !selfTrackingForm.tracking_url.trim()
    ) {
      setSelfTrackingError("Courier partner, tracking ID, and tracking URL are all required")
      return
    }
    setSavingSelfTracking(true)
    setSelfTrackingError(null)
    try {
      await vendorReturnsApi.saveSelfTracking(selfTrackingReturn.id, {
        courier_partner: selfTrackingForm.courier_partner.trim(),
        tracking_number: selfTrackingForm.tracking_number.trim(),
        tracking_url: selfTrackingForm.tracking_url.trim(),
      })
      setSelfTrackingReturn(null)
      await loadReturns()
      notifyVendorDataChanged()
    } catch (e: any) {
      setSelfTrackingError(e?.message || "Failed to save tracking")
    } finally {
      setSavingSelfTracking(false)
    }
  }

  const updateReturnStatus = async (
    item: VendorReturnRequest,
    action: "pickup_initiated" | "picked_up" | "received"
  ) => {
    setStatusBusyId(`${action}:${item.id}`)
    setError(null)
    try {
      await vendorReturnsApi.updateStatus(item.id, action)
      await loadReturns()
      notifyVendorDataChanged()
    } catch (e: any) {
      setError(e?.message || "Failed to update return status")
    } finally {
      setStatusBusyId(null)
    }
  }

  const stats = {
    total: counts.total,
    pending: counts.pending_approval,
    needsLogistics: counts.needs_logistics,
    inProgress: counts.in_progress,
    refunded: counts.refunded,
    pickup: counts.pickup,
  }

  const pageCount = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE))
  const visibleReturns = returns

  const filterOptions = [
    { value: "all" as const, label: "All", count: stats.total },
    { value: "pending" as const, label: "Needs logistics", count: stats.needsLogistics },
    { value: "approved" as const, label: "In progress", count: stats.inProgress },
    { value: "in_transit" as const, label: "Pickup", count: stats.pickup },
    { value: "refunded" as const, label: "Closed", count: stats.refunded },
  ]

  let content

  if (loading && returns.length === 0 && counts.total === 0) {
    content = (
      <Container className="mx-auto max-w-7xl space-y-5 p-4 md:p-6 md:space-y-6">
        <div className="animate-fade-in-up">
          <Heading level="h1" className="text-2xl tracking-tight md:text-3xl">
            Returns
          </Heading>
          <Text className="mt-1 text-ui-fg-subtle">
            Return and replacement requests for your products
          </Text>
        </div>
        <PageLoader label="Loading returns…" className="min-h-[40vh]" />
      </Container>
    )
  } else if (error && returns.length === 0 && counts.total === 0) {
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
                ? `${stats.total} return${stats.total === 1 ? "" : "s"} for your products`
                : "Return and replacement requests for your products"}
            </Text>
          </div>
        </div>

        {stats.total === 0 ? (
          <EmptyState
            accent="oweg"
            icon={<ArrowPath />}
            title="No returns yet"
            description="When a customer requests a return: Easy Ship → pick a reverse courier service with charges; Self Ship → add tracking ID / URL for admin."
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
                subtext={<Text className="text-ui-fg-subtle">All statuses</Text>}
              />
              <StatCard
                icon={<ArrowPath />}
                label="In progress"
                value={stats.inProgress}
                subtext={
                  <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                    <StatusDot variant="info" />
                    <Text size="small">Approved / pickup</Text>
                  </span>
                }
              />
              <StatCard
                icon={<ArrowPath />}
                label="Pickup"
                value={stats.pickup}
                subtext={
                  <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                    <StatusDot variant="warning" />
                    <Text size="small">In transit</Text>
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

            {visibleReturns.length === 0 ? (
              <EmptyState
                accent="gray"
                icon={<MagnifyingGlass />}
                title="No matching returns"
                description={
                  searchDebounced
                    ? `No returns match "${searchDebounced}".`
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
                  <div className="hidden lg:grid lg:grid-cols-[100px_minmax(0,1.2fr)_100px_140px_minmax(0,1.4fr)_110px] lg:gap-4 border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
                    {["Order", "Customer", "Type", "Status", "Reason / items", "Requested"].map(
                      (h) => (
                        <Text key={h} size="small" weight="plus" className="text-ui-fg-subtle">
                          {h}
                        </Text>
                      )
                    )}
                  </div>
                  <div className="divide-y divide-ui-border-base/70">
                    {visibleReturns.map((item) => {
                      const productLabels =
                        item.items?.length > 0
                          ? item.items
                              .map(
                                (line) =>
                                  `${line.title || "Item"} ×${
                                    Number.isFinite(Number(line.quantity))
                                      ? line.quantity
                                      : 1
                                  }`
                              )
                              .join(", ")
                          : item.vendor_items?.length > 0
                            ? item.vendor_items
                                .map(
                                  (line) =>
                                    `${line.title} ×${
                                      Number.isFinite(Number(line.quantity))
                                        ? line.quantity
                                        : 1
                                    }`
                                )
                                .join(", ")
                            : item.reason || "—"

                      return (
                        <div
                          key={item.id}
                          className="grid grid-cols-1 gap-2 px-4 py-4 transition-colors hover:bg-ui-bg-subtle/60 lg:grid-cols-[100px_minmax(0,1.2fr)_100px_140px_minmax(0,1.4fr)_110px] lg:items-start lg:gap-4"
                        >
                          <div>
                            <Text weight="plus">
                              #{item.order_display_id || item.order_id.slice(0, 8)}
                            </Text>
                            {item.shipping_method === "easy" ? (
                              <Text size="xsmall" className="mt-0.5 text-oweg-700 dark:text-oweg-300">
                                Easy Ship
                              </Text>
                            ) : item.shipping_method === "self" ? (
                              <Text size="xsmall" className="mt-0.5 text-ui-fg-subtle">
                                Self Ship
                              </Text>
                            ) : null}
                          </div>
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
                          <div className="min-w-0 space-y-2">
                            <Text size="small" className="line-clamp-2">
                              {productLabels}
                            </Text>
                            {item.rejection_reason ? (
                              <Text size="xsmall" className="text-red-600">
                                Rejected: {item.rejection_reason}
                              </Text>
                            ) : null}
                            {typeof item.order_total === "number" ? (
                              <Text size="xsmall" className="text-ui-fg-muted">
                                Order {formatCurrency(item.order_total)}
                              </Text>
                            ) : null}
                            {item.reverse_courier_name ? (
                              <Text size="xsmall" className="text-ui-fg-subtle">
                                Reverse: {item.reverse_courier_name}
                                {item.reverse_courier_rate != null
                                  ? ` · ${formatCurrency(item.reverse_courier_rate)}`
                                  : ""}
                                {item.shiprocket_awb ? ` · AWB ${item.shiprocket_awb}` : ""}
                              </Text>
                            ) : null}
                            {item.reverse_tracking_number &&
                            item.reverse_tracking_url &&
                            item.reverse_courier_partner ? (
                              <Text size="xsmall" className="text-ui-fg-subtle">
                                Self return
                                {item.reverse_courier_partner
                                  ? ` · ${item.reverse_courier_partner}`
                                  : ""}
                                {item.reverse_tracking_number
                                  ? ` · AWB ${item.reverse_tracking_number}`
                                  : ""}
                                {item.reverse_tracking_url ? " · tracking URL saved" : ""}
                              </Text>
                            ) : null}
                            {item.can_select_reverse_courier ? (
                              <Button
                                size="small"
                                variant="secondary"
                                onClick={() => void openCourierPicker(item.id)}
                              >
                                {item.reverse_courier_name
                                  ? "Change reverse courier"
                                  : "Select reverse courier"}
                              </Button>
                            ) : null}
                            {item.can_add_self_tracking ? (
                              <Button
                                size="small"
                                variant="secondary"
                                onClick={() => openSelfTracking(item)}
                              >
                                {item.reverse_tracking_number &&
                                item.reverse_tracking_url &&
                                item.reverse_courier_partner
                                  ? "Update return tracking"
                                  : "Add return tracking"}
                              </Button>
                            ) : null}
                            {(item.can_mark_pickup_initiated ||
                              item.can_mark_picked_up ||
                              item.can_mark_received ||
                              item.returned_to_vendor) && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {item.can_mark_pickup_initiated ? (
                                  <Button
                                    size="small"
                                    variant="secondary"
                                    disabled={Boolean(statusBusyId)}
                                    isLoading={statusBusyId === `pickup_initiated:${item.id}`}
                                    onClick={() =>
                                      void updateReturnStatus(item, "pickup_initiated")
                                    }
                                  >
                                    Pickup started
                                  </Button>
                                ) : null}
                                {item.can_mark_picked_up ? (
                                  <Button
                                    size="small"
                                    variant="secondary"
                                    disabled={Boolean(statusBusyId)}
                                    isLoading={statusBusyId === `picked_up:${item.id}`}
                                    onClick={() => void updateReturnStatus(item, "picked_up")}
                                  >
                                    Picked up
                                  </Button>
                                ) : null}
                                {item.can_mark_received ? (
                                  <Button
                                    size="small"
                                    variant="primary"
                                    disabled={Boolean(statusBusyId)}
                                    isLoading={statusBusyId === `received:${item.id}`}
                                    onClick={() => void updateReturnStatus(item, "received")}
                                  >
                                    Delivered to me
                                  </Button>
                                ) : null}
                                {item.returned_to_vendor ? (
                                  <Text
                                    size="xsmall"
                                    className="w-full font-medium text-emerald-700 dark:text-emerald-400"
                                  >
                                    Returned to vendor
                                    {item.returned_to_vendor_at
                                      ? ` · ${formatDate(item.returned_to_vendor_at)}`
                                      : ""}
                                  </Text>
                                ) : null}
                              </div>
                            )}
                            {item.shipping_method === "easy" &&
                            item.needs_return_logistics ? (
                              <Text size="xsmall" className="text-amber-700 dark:text-amber-300">
                                Select a reverse courier service (rates shown). After admin
                                approves, pickup to your store is booked automatically.
                              </Text>
                            ) : null}
                            {item.shipping_method === "self" && item.needs_return_logistics ? (
                              <Text size="xsmall" className="text-amber-700 dark:text-amber-300">
                                Add courier partner, tracking ID, and tracking URL before marking
                                pickup.
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
                <div className="flex flex-col gap-2 text-ui-fg-muted sm:flex-row sm:items-center sm:justify-between">
                  <Text size="small">
                    Showing {visibleReturns.length ? (page - 1) * PAGE_SIZE + 1 : 0}-
                    {Math.min(page * PAGE_SIZE, totalFiltered)} of {totalFiltered}
                  </Text>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 disabled:opacity-40"
                    >
                      <ChevronLeft />
                    </button>
                    <Text size="small">
                      Page {page} of {pageCount}
                    </Text>
                    <button
                      type="button"
                      disabled={page >= pageCount}
                      onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 disabled:opacity-40"
                    >
                      <ChevronRight />
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {activeReturnId ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div className="w-full max-w-lg rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xl">
              <Heading level="h2" className="text-lg">
                Select {reverseProviderLabel} reverse courier
              </Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Pickup from customer → your store. Rates below are from {reverseProviderLabel}.
                Admin approval books this automatically.
              </Text>

              {couriersLoading ? (
                <Text className="mt-4 text-ui-fg-subtle">Loading services…</Text>
              ) : courierError && !couriers.length ? (
                <Text className="mt-4 text-ui-fg-error">{courierError}</Text>
              ) : (
                <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                  {couriers.map((courier) => {
                    const active = selectedCourierId === courier.courier_id
                    const charge =
                      courier.rate != null
                        ? courier.rate
                        : courier.freight_charge != null
                          ? courier.freight_charge
                          : null
                    return (
                      <button
                        key={courier.courier_id}
                        type="button"
                        onClick={() => setSelectedCourierId(courier.courier_id)}
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          active
                            ? "border-oweg-500/50 bg-oweg-500/10"
                            : "border-ui-border-base/70 hover:bg-ui-bg-subtle"
                        }`}
                      >
                        <div>
                          <Text size="small" weight="plus">
                            {courier.courier_name}
                          </Text>
                          <Text size="xsmall" className="text-ui-fg-muted">
                            {courier.etd != null ? `ETD: ${String(courier.etd)}` : "ETD: —"}
                            {courier.freight_charge != null &&
                            courier.rate != null &&
                            courier.freight_charge !== courier.rate
                              ? ` · Freight ${formatCurrency(courier.freight_charge)}`
                              : ""}
                          </Text>
                        </div>
                        <Text size="small" weight="plus">
                          {charge != null ? formatCurrency(charge) : "—"}
                        </Text>
                      </button>
                    )
                  })}
                </div>
              )}

              {courierError && couriers.length > 0 ? (
                <Text size="small" className="mt-3 text-ui-fg-error">
                  {courierError}
                </Text>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setActiveReturnId(null)}
                  disabled={savingCourier}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  onClick={() => void confirmCourier()}
                  disabled={savingCourier || selectedCourierId == null || couriersLoading}
                  isLoading={savingCourier}
                >
                  Confirm service
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {selfTrackingReturn ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div className="w-full max-w-lg rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xl">
              <Heading level="h2" className="text-lg">
                Self ship return tracking
              </Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Order #
                {selfTrackingReturn.order_display_id ||
                  selfTrackingReturn.order_id.slice(0, 8)}{" "}
                was Self Ship. Add reverse tracking so admin can see it on Return Requests.
              </Text>

              <div className="mt-4 space-y-3">
                <label className="block space-y-1">
                  <Text size="small" weight="plus">
                    Courier partner
                  </Text>
                  <input
                    type="text"
                    value={selfTrackingForm.courier_partner}
                    onChange={(e) =>
                      setSelfTrackingForm((prev) => ({
                        ...prev,
                        courier_partner: e.target.value,
                      }))
                    }
                    placeholder="e.g. Delhivery, DTDC"
                    className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base px-3 text-sm outline-none focus:border-ui-border-strong"
                  />
                </label>
                <label className="block space-y-1">
                  <Text size="small" weight="plus">
                    Tracking ID / AWB
                  </Text>
                  <input
                    type="text"
                    value={selfTrackingForm.tracking_number}
                    onChange={(e) =>
                      setSelfTrackingForm((prev) => ({
                        ...prev,
                        tracking_number: e.target.value,
                      }))
                    }
                    placeholder="Return AWB / tracking number"
                    className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base px-3 text-sm outline-none focus:border-ui-border-strong"
                  />
                </label>
                <label className="block space-y-1">
                  <Text size="small" weight="plus">
                    Tracking URL
                  </Text>
                  <input
                    type="url"
                    value={selfTrackingForm.tracking_url}
                    onChange={(e) =>
                      setSelfTrackingForm((prev) => ({
                        ...prev,
                        tracking_url: e.target.value,
                      }))
                    }
                    placeholder="https://…"
                    className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base px-3 text-sm outline-none focus:border-ui-border-strong"
                  />
                </label>
              </div>

              {selfTrackingError ? (
                <Text size="small" className="mt-3 text-ui-fg-error">
                  {selfTrackingError}
                </Text>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setSelfTrackingReturn(null)}
                  disabled={savingSelfTracking}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  onClick={() => void saveSelfTracking()}
                  disabled={
                    savingSelfTracking ||
                    !selfTrackingForm.courier_partner.trim() ||
                    !selfTrackingForm.tracking_number.trim() ||
                    !selfTrackingForm.tracking_url.trim()
                  }
                  isLoading={savingSelfTracking}
                >
                  Save tracking
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorReturnsPage
