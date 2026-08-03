"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  Textarea,
  clx,
} from "@medusajs/ui"
import { ArrowPath, MagnifyingGlass, PlusMini, XMark } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import EmptyState from "@/components/EmptyState"
import StatusDot, { returnStatusVariant } from "@/components/dashboard/StatusDot"
import {
  ApiError,
  logApiFailure,
  vendorOrdersApi,
  vendorProfileApi,
  vendorReportsApi,
  vendorReturnsApi,
  type VendorReportTicket,
  type VendorReturnRequest,
} from "@/lib/api/client"
import { useRouter } from "next/navigation"

type Mode = "returns" | "pick_order" | "ticket" | "my_tickets"

type OrderRow = {
  id: string
  display_id?: string | number
  created_at?: string
  email?: string
  currency_code?: string
  vendor_status_label?: string
  product_names?: string[]
  items?: Array<{
    id?: string
    title?: string
    quantity?: number
    unit_price?: number
    variant_sku?: string
  }>
}

const formatDate = (value?: string) => {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

const ticketStatusVariant = (status?: string) => {
  switch (status) {
    case "open":
      return "warning" as const
    case "in_review":
      return "info" as const
    case "resolved":
      return "success" as const
    case "closed":
      return "neutral" as const
    default:
      return "neutral" as const
  }
}

const formatCurrency = (amount: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: (currency || "INR").toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount)

const getTicketProductName = (ticket: VendorReportTicket) => {
  if (ticket.product_name?.trim()) return ticket.product_name.trim()
  const fromSnap = Array.isArray(ticket.product_snapshot)
    ? ticket.product_snapshot
        .map((p: any) => String(p?.title || "").trim())
        .filter(Boolean)
        .join(", ")
    : ""
  return fromSnap || "—"
}

const getTicketOrderTotal = (ticket: VendorReportTicket) => {
  if (ticket.order_total != null && Number.isFinite(Number(ticket.order_total))) {
    return Number(ticket.order_total)
  }
  const snap = ticket.order_snapshot || {}
  if (snap.vendor_total != null) return Number(snap.vendor_total) || 0
  if (snap.total != null) return Number(snap.total) || 0
  if (Array.isArray(ticket.product_snapshot)) {
    return ticket.product_snapshot.reduce(
      (sum: number, p: any) =>
        sum + Number(p?.unit_price || 0) * Number(p?.quantity || 1),
      0
    )
  }
  return null
}

const VendorReportsPage = () => {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("returns")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const [returns, setReturns] = useState<VendorReturnRequest[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [tickets, setTickets] = useState<VendorReportTicket[]>([])
  const [vendorHint, setVendorHint] = useState("vendor")
  const [viewingTicket, setViewingTicket] = useState<VendorReportTicket | null>(null)

  const [selectedReturn, setSelectedReturn] = useState<VendorReturnRequest | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null)
  const [orderDetailLoading, setOrderDetailLoading] = useState(false)

  const [issueTitle, setIssueTitle] = useState("")
  const [issueDescription, setIssueDescription] = useState("")
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const resetTicketForm = () => {
    setIssueTitle("")
    setIssueDescription("")
    setImageFiles([])
    setImagePreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url))
      return []
    })
  }

  const loadBase = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [returnsRes, ticketsRes, meRes] = await Promise.all([
        vendorReturnsApi.list(),
        vendorReportsApi.list(),
        vendorProfileApi.getMe().catch(() => null),
      ])
      setReturns(returnsRes?.return_requests || [])
      setTickets(ticketsRes?.reports || [])
      const vendor = meRes?.vendor
      const hint =
        vendor?.store_name ||
        vendor?.name ||
        vendor?.email?.split("@")[0] ||
        "vendor"
      setVendorHint(String(hint))
    } catch (e: any) {
      if (e?.status === 403) {
        router.push("/pending")
        return
      }
      setError(e?.message || "Failed to load claims")
      logApiFailure("Vendor claims load", e)
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
    void loadBase()
  }, [router, loadBase])

  const filteredReturns = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return returns
    return returns.filter((item) => {
      const orderId = String(item.order_display_id || item.order_id)
      const titles = (item.vendor_items || []).map((l) => l.title).join(" ")
      return (
        orderId.toLowerCase().includes(q) ||
        item.customer_email?.toLowerCase().includes(q) ||
        item.customer_name?.toLowerCase().includes(q) ||
        item.reason?.toLowerCase().includes(q) ||
        titles.toLowerCase().includes(q)
      )
    })
  }, [returns, search])

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((order) => {
      const id = String(order.display_id || order.id)
      const names = (order.product_names || []).join(" ")
      return (
        id.toLowerCase().includes(q) ||
        order.email?.toLowerCase().includes(q) ||
        names.toLowerCase().includes(q)
      )
    })
  }, [orders, search])

  const openTicketFromReturn = async (item: VendorReturnRequest) => {
    setSelectedReturn(item)
    setSelectedOrder(null)
    setOrderDetailLoading(true)
    setError(null)
    resetTicketForm()
    setMode("ticket")
    try {
      const res = await vendorOrdersApi.get(item.order_id)
      setSelectedOrder(res?.order || null)
    } catch (e: any) {
      setError(e?.message || "Failed to load order details")
      logApiFailure("Report order detail", e)
    } finally {
      setOrderDetailLoading(false)
    }
  }

  const openOrderPicker = async () => {
    setMode("pick_order")
    setSearch("")
    setError(null)
    setLoading(true)
    try {
      const res = await vendorOrdersApi.list()
      setOrders(res?.orders || [])
    } catch (e: any) {
      setError(e?.message || "Failed to load orders")
      logApiFailure("Report order list", e)
    } finally {
      setLoading(false)
    }
  }

  const openTicketFromOrder = async (order: OrderRow) => {
    setSelectedReturn(null)
    setSelectedOrder(order)
    setOrderDetailLoading(true)
    setError(null)
    resetTicketForm()
    setMode("ticket")
    try {
      const res = await vendorOrdersApi.get(order.id)
      setSelectedOrder(res?.order || order)
    } catch (e: any) {
      setError(e?.message || "Failed to load order details")
      logApiFailure("Report order detail", e)
    } finally {
      setOrderDetailLoading(false)
    }
  }

  const onPickImages = (files: FileList | null) => {
    if (!files?.length) return
    const next = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 8)
    const remaining = Math.max(0, 8 - imageFiles.length)
    const accepted = next.slice(0, remaining)
    if (!accepted.length) return
    const previews = accepted.map((f) => URL.createObjectURL(f))
    setImageFiles((prev) => [...prev, ...accepted])
    setImagePreviews((prev) => [...prev, ...previews])
  }

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => {
      const url = prev[index]
      if (url) URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== index)
    })
  }

  const submitTicket = async () => {
    const orderId = selectedOrder?.id || selectedReturn?.order_id
    if (!orderId) {
      setError("Select an order first")
      return
    }
    if (issueTitle.trim().length < 3) {
      setError("Enter a short issue title")
      return
    }
    if (issueDescription.trim().length < 10) {
      setError("Describe what happened in a short paragraph")
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const uploadedUrls: string[] = []
      for (const file of imageFiles) {
        const uploaded = await vendorReportsApi.uploadImage(file, vendorHint)
        uploadedUrls.push(uploaded.url)
      }

      await vendorReportsApi.create({
        order_id: orderId,
        return_request_id: selectedReturn?.id || null,
        source: selectedReturn ? "return" : "order_lookup",
        issue_title: issueTitle.trim(),
        issue_description: issueDescription.trim(),
        image_urls: uploadedUrls,
      })

      setSuccessMessage("Claim raised. Admin can see it under Vendor Claims.")
      resetTicketForm()
      await loadBase()
      setMode("my_tickets")
    } catch (e: any) {
      const msg =
        e instanceof ApiError ? e.message : e?.message || "Failed to raise claim"
      setError(msg)
      logApiFailure("Create vendor claim", e)
    } finally {
      setSubmitting(false)
    }
  }

  const productLines =
    selectedOrder?.items?.length
      ? selectedOrder.items
      : (selectedReturn?.vendor_items || []).map((item) => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
        }))

  let content

  if (loading && mode !== "ticket") {
    content = <PageSkeleton label="Loading claims…" stats={0} rows={6} cols={5} showAction={false} />
  } else if (error && mode === "returns" && !returns.length && !tickets.length) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <Text className="text-ui-fg-error">{error}</Text>
          <Button className="mt-4" variant="secondary" onClick={() => void loadBase()}>
            Retry
          </Button>
        </div>
      </Container>
    )
  } else {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        <div className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              Claims
            </Heading>
            <Text className="text-ui-fg-subtle mt-1">
              Raise a claim when a return is lost or the product received differs from what you
              shipped — reviewed by admin
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={mode === "returns" ? "primary" : "secondary"}
              onClick={() => {
                setMode("returns")
                setSearch("")
                setError(null)
              }}
            >
              Return orders
            </Button>
            <Button
              variant={mode === "my_tickets" ? "primary" : "secondary"}
              onClick={() => {
                setMode("my_tickets")
                setViewingTicket(null)
                setError(null)
              }}
            >
              My claims ({tickets.length})
            </Button>
            <Button
              variant="secondary"
              onClick={() => void loadBase()}
              disabled={loading}
            >
              <ArrowPath />
              Refresh
            </Button>
          </div>
        </div>

        {successMessage && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <Text className="text-sm text-emerald-800">{successMessage}</Text>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
            <Text className="text-sm text-ui-fg-error">{error}</Text>
          </div>
        )}

        {mode === "returns" && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full max-w-md">
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-muted" />
                <Input
                  className="pl-9"
                  placeholder="Search return orders…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={() => void openOrderPicker()}>
                My order is not here
              </Button>
            </div>

            {filteredReturns.length === 0 ? (
              <EmptyState
                accent="orange"
                title="No return orders"
                description="When customers return your products, they show up here. If your order is missing, use “My order is not here”."
                primaryAction={{
                  label: "My order is not here",
                  onClick: () => void openOrderPicker(),
                }}
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-ui-border-base">
                <table className="w-full text-left text-sm">
                  <thead className="bg-ui-bg-subtle text-ui-fg-subtle">
                    <tr>
                      <th className="px-4 py-3 font-medium">Order</th>
                      <th className="px-4 py-3 font-medium">Customer</th>
                      <th className="px-4 py-3 font-medium">Products</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReturns.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-ui-border-base hover:bg-ui-bg-subtle-hover"
                      >
                        <td className="px-4 py-3 font-medium">
                          #{item.order_display_id || item.order_id.slice(-6)}
                        </td>
                        <td className="px-4 py-3">
                          <div>{item.customer_name || "—"}</div>
                          <div className="text-ui-fg-subtle text-xs">
                            {item.customer_email || ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          {(item.vendor_items || [])
                            .map((l) => l.title)
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2">
                            <StatusDot variant={returnStatusVariant(item.status)} />
                            <Text size="small">
                              {(item.status || "").replace(/_/g, " ")}
                            </Text>
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDate(item.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="small"
                            onClick={() => void openTicketFromReturn(item)}
                          >
                            Raise claim
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {mode === "pick_order" && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Text className="font-medium">Select your order</Text>
                <Text className="text-ui-fg-subtle text-sm">
                  Click an order to load details and raise a claim
                </Text>
              </div>
              <Button variant="secondary" onClick={() => setMode("returns")}>
                Back to returns
              </Button>
            </div>
            <div className="relative w-full max-w-md">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-muted" />
              <Input
                className="pl-9"
                placeholder="Search your orders…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {filteredOrders.length === 0 ? (
              <EmptyState
                accent="gray"
                title="No orders found"
                description="No vendor orders match this search."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-ui-border-base">
                <table className="w-full text-left text-sm">
                  <thead className="bg-ui-bg-subtle text-ui-fg-subtle">
                    <tr>
                      <th className="px-4 py-3 font-medium">Order</th>
                      <th className="px-4 py-3 font-medium">Products</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-t border-ui-border-base hover:bg-ui-bg-subtle-hover cursor-pointer"
                        onClick={() => void openTicketFromOrder(order)}
                      >
                        <td className="px-4 py-3 font-medium">
                          #{order.display_id || order.id.slice(-6)}
                        </td>
                        <td className="px-4 py-3 max-w-[260px]">
                          {(order.product_names || []).join(", ") || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {order.vendor_status_label || "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="small" variant="secondary">
                            Select
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {mode === "ticket" && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Text className="font-medium text-lg">Raise claim</Text>
                <Text className="text-ui-fg-subtle text-sm">
                  Order #
                  {selectedOrder?.display_id ||
                    selectedReturn?.order_display_id ||
                    selectedOrder?.id?.slice(-6) ||
                    "—"}
                  {selectedReturn ? " · from return list" : " · order lookup"}
                </Text>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  resetTicketForm()
                  setMode(selectedReturn ? "returns" : "pick_order")
                }}
              >
                Cancel
              </Button>
            </div>

            <div className="rounded-xl border border-ui-border-base p-4 md:p-5 space-y-3">
              <Text className="font-medium">Order & product details</Text>
              {orderDetailLoading ? (
                <Text className="text-ui-fg-subtle text-sm">Loading details…</Text>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2 text-sm">
                    <div>
                      <span className="text-ui-fg-subtle">Customer: </span>
                      {selectedOrder?.email ||
                        selectedReturn?.customer_email ||
                        selectedReturn?.customer_name ||
                        "—"}
                    </div>
                    <div>
                      <span className="text-ui-fg-subtle">Placed: </span>
                      {formatDate(
                        selectedOrder?.created_at || selectedReturn?.created_at
                      )}
                    </div>
                  </div>
                  <ul className="divide-y divide-ui-border-base rounded-lg border border-ui-border-base">
                    {(productLines || []).length === 0 ? (
                      <li className="px-3 py-2 text-sm text-ui-fg-subtle">
                        No product lines found
                      </li>
                    ) : (
                      (productLines || []).map((line: any, idx: number) => (
                        <li
                          key={line.id || idx}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span>{line.title || "Item"}</span>
                          <span className="text-ui-fg-subtle">
                            Qty {line.quantity ?? "—"}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </>
              )}
            </div>

            <div className="rounded-xl border border-ui-border-base p-4 md:p-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="issue-title">Issue</Label>
                <Input
                  id="issue-title"
                  placeholder="e.g. Damaged product returned / wrong item"
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issue-desc">What happened</Label>
                <Textarea
                  id="issue-desc"
                  rows={5}
                  placeholder="Write a short paragraph describing the issue…"
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Images (optional, max 8)</Label>
                <Text className="text-xs text-ui-fg-subtle">
                  Stored under vendor/{vendorHint}/report/
                </Text>
                <div className="flex flex-wrap gap-3">
                  {imagePreviews.map((src, index) => (
                    <div
                      key={src}
                      className="relative h-20 w-20 overflow-hidden rounded-lg border border-ui-border-base"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white"
                        onClick={() => removeImage(index)}
                        aria-label="Remove image"
                      >
                        <XMark />
                      </button>
                    </div>
                  ))}
                  {imageFiles.length < 8 && (
                    <label
                      className={clx(
                        "flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1",
                        "rounded-lg border border-dashed border-ui-border-base text-ui-fg-subtle hover:bg-ui-bg-subtle"
                      )}
                    >
                      <PlusMini />
                      <span className="text-[10px]">Add</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          onPickImages(e.target.files)
                          e.target.value = ""
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
              <Button isLoading={submitting} onClick={() => void submitTicket()}>
                Submit claim
              </Button>
            </div>
          </div>
        )}

        {mode === "my_tickets" && (
          <>
            {tickets.length === 0 ? (
              <EmptyState
                accent="oweg"
                title="No claims yet"
                description="Raise a claim from a return order or via “My order is not here”."
                primaryAction={{
                  label: "View return orders",
                  onClick: () => setMode("returns"),
                }}
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-ui-border-base bg-ui-bg-subtle/80">
                        {[
                          "Date",
                          "Order ID",
                          "Product",
                          "Order total",
                          "Status",
                          "",
                        ].map((column) => (
                          <th
                            key={column || "action"}
                            scope="col"
                            className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wide text-ui-fg-muted"
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ui-border-base/60">
                      {tickets.map((ticket) => {
                        const orderTotal = getTicketOrderTotal(ticket)
                        const currency =
                          ticket.currency_code ||
                          ticket.order_snapshot?.currency_code ||
                          "INR"
                        return (
                          <tr
                            key={ticket.id}
                            className="transition-colors hover:bg-ui-bg-subtle/50"
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-ui-fg-subtle">
                              {formatDate(ticket.created_at)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-medium text-ui-fg-base">
                              #{ticket.order_display_id || ticket.order_id.slice(-6)}
                            </td>
                            <td className="max-w-[16rem] truncate px-4 py-3 text-ui-fg-base">
                              {getTicketProductName(ticket)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium">
                              {orderTotal != null && orderTotal > 0
                                ? formatCurrency(orderTotal, currency)
                                : "—"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span className="inline-flex items-center gap-2">
                                <StatusDot variant={ticketStatusVariant(ticket.status)} />
                                <Text size="small" className="capitalize">
                                  {(ticket.status || "open").replace(/_/g, " ")}
                                </Text>
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              <Button
                                size="small"
                                variant="secondary"
                                onClick={() => setViewingTicket(ticket)}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {viewingTicket ? (
              <div
                className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-[2px] sm:items-center"
                onClick={() => setViewingTicket(null)}
              >
                <div
                  className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ui-border-base bg-ui-bg-base shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-ui-border-base bg-ui-bg-base px-5 py-4">
                    <div>
                      <Heading level="h2" className="text-lg tracking-tight">
                        Claim details
                      </Heading>
                      <Text size="small" className="mt-0.5 text-ui-fg-subtle">
                        Order #
                        {viewingTicket.order_display_id ||
                          viewingTicket.order_id.slice(-6)}{" "}
                        · {formatDate(viewingTicket.created_at)}
                      </Text>
                    </div>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setViewingTicket(null)}
                    >
                      Close
                    </Button>
                  </div>

                  <div className="space-y-5 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full bg-ui-bg-subtle px-3 py-1">
                        <StatusDot variant={ticketStatusVariant(viewingTicket.status)} />
                        <Text size="small" className="capitalize font-medium">
                          {(viewingTicket.status || "open").replace(/_/g, " ")}
                        </Text>
                      </span>
                      {viewingTicket.approved_amount != null &&
                      Number(viewingTicket.approved_amount) > 0 ? (
                        <Text size="small" weight="plus" className="text-emerald-600">
                          Approved{" "}
                          {formatCurrency(Number(viewingTicket.approved_amount))}
                        </Text>
                      ) : null}
                    </div>

                    <div className="grid gap-3 rounded-xl border border-ui-border-base/70 bg-ui-bg-subtle/40 p-4 sm:grid-cols-2">
                      <div>
                        <Text size="xsmall" className="uppercase tracking-wide text-ui-fg-muted">
                          Product
                        </Text>
                        <Text size="small" weight="plus" className="mt-0.5">
                          {getTicketProductName(viewingTicket)}
                        </Text>
                      </div>
                      <div>
                        <Text size="xsmall" className="uppercase tracking-wide text-ui-fg-muted">
                          Order total
                        </Text>
                        <Text size="small" weight="plus" className="mt-0.5 tabular-nums">
                          {(() => {
                            const total = getTicketOrderTotal(viewingTicket)
                            const currency =
                              viewingTicket.currency_code ||
                              viewingTicket.order_snapshot?.currency_code ||
                              "INR"
                            return total != null && total > 0
                              ? formatCurrency(total, currency)
                              : "—"
                          })()}
                        </Text>
                      </div>
                      <div className="sm:col-span-2">
                        <Text size="xsmall" className="uppercase tracking-wide text-ui-fg-muted">
                          Issue
                        </Text>
                        <Text size="small" weight="plus" className="mt-0.5">
                          {viewingTicket.issue_title}
                        </Text>
                      </div>
                    </div>

                    <div>
                      <Text size="small" weight="plus" className="mb-1.5">
                        Your description
                      </Text>
                      <Text
                        size="small"
                        className="whitespace-pre-wrap rounded-xl border border-ui-border-base/60 bg-ui-bg-base px-3 py-2.5 text-ui-fg-base"
                      >
                        {viewingTicket.issue_description || "—"}
                      </Text>
                    </div>

                    {!!viewingTicket.image_urls?.length && (
                      <div>
                        <Text size="small" weight="plus" className="mb-2">
                          Attachments
                        </Text>
                        <div className="flex flex-wrap gap-2">
                          {viewingTicket.image_urls.map((url) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="block h-20 w-20 overflow-hidden rounded-lg border border-ui-border-base transition-opacity hover:opacity-90"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <Text size="small" weight="plus" className="mb-1.5">
                        Admin response
                      </Text>
                      {viewingTicket.admin_notes ? (
                        <div className="rounded-xl border border-oweg-500/20 bg-oweg-500/[0.06] px-3 py-2.5">
                          <Text size="small" className="whitespace-pre-wrap text-ui-fg-base">
                            {viewingTicket.admin_notes}
                          </Text>
                        </div>
                      ) : (
                        <Text size="small" className="text-ui-fg-muted">
                          No admin note yet — claim is still under review.
                        </Text>
                      )}
                    </div>

                    {Array.isArray(viewingTicket.product_snapshot) &&
                    viewingTicket.product_snapshot.length > 0 ? (
                      <div>
                        <Text size="small" weight="plus" className="mb-2">
                          Products on order
                        </Text>
                        <ul className="divide-y divide-ui-border-base/60 overflow-hidden rounded-xl border border-ui-border-base/70">
                          {viewingTicket.product_snapshot.map((line: any, idx: number) => (
                            <li
                              key={line.id || idx}
                              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                            >
                              <span className="font-medium">{line.title || "Item"}</span>
                              <span className="text-ui-fg-subtle">
                                Qty {line.quantity ?? "—"}
                                {line.unit_price != null
                                  ? ` · ${formatCurrency(
                                      Number(line.unit_price) * Number(line.quantity || 1)
                                    )}`
                                  : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorReportsPage
