"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Container, Heading, Text, Button, clx } from "@medusajs/ui"
import { useRouter } from "next/navigation"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import EmptyState from "@/components/EmptyState"
import StatCard from "@/components/dashboard/StatCard"
import {
  vendorCommissionInvoicesApi,
  type VendorCommissionInvoice,
} from "@/lib/api/client"
import { downloadCommissionInvoicePdf } from "@/lib/commission-invoice-pdf"
import { useVendorLive } from "@/lib/useVendorLive"
import { ArrowPath, DocumentText, ArrowDownTray } from "@medusajs/icons"

type InvoiceRange = "today" | "1m" | "custom" | "all"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    })
  } catch {
    return "—"
  }
}

const RANGE_OPTIONS: { id: InvoiceRange; label: string; hint: string }[] = [
  { id: "today", label: "Today", hint: "Delivered today" },
  { id: "1m", label: "1 Month", hint: "Last 30 days" },
  { id: "custom", label: "Custom", hint: "Pick dates" },
  { id: "all", label: "All", hint: "Full history" },
]

const RangeChip = ({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean
  label: string
  hint: string
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className={clx(
      "flex min-w-[7rem] flex-col items-start rounded-xl border px-4 py-3 text-left transition-all duration-200",
      active
        ? "border-blue-600 bg-blue-600/10 shadow-sm ring-1 ring-blue-600/30 dark:border-blue-400 dark:ring-blue-400/30"
        : "border-ui-border-base bg-ui-bg-base hover:border-ui-border-strong hover:bg-ui-bg-subtle"
    )}
  >
    <Text weight="plus" size="small" className={active ? "text-blue-700 dark:text-blue-300" : ""}>
      {label}
    </Text>
    <Text size="xsmall" className="text-ui-fg-muted">
      {hint}
    </Text>
  </button>
)

const InvoicePreview = ({ data }: { data: VendorCommissionInvoice }) => (
  <details className="group overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-base">
    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 md:px-6 [&::-webkit-details-marker]:hidden">
      <div>
        <Heading level="h2" className="text-lg">
          Invoice preview
        </Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {data.invoice_number} · {data.period_label}
        </Text>
      </div>
      <Text size="small" className="text-ui-fg-muted group-open:hidden">
        Show preview
      </Text>
      <Text size="small" className="hidden text-ui-fg-muted group-open:inline">
        Hide preview
      </Text>
    </summary>

    <div className="border-t border-ui-border-base bg-white text-slate-900 dark:bg-white">
      <div className="border-b border-slate-200 px-6 py-5">
        <Text size="xsmall" className="font-semibold uppercase tracking-wider text-slate-500">
          Commission Invoice (Format)
        </Text>
        <Heading level="h2" className="mt-2 text-center text-xl font-bold text-slate-900">
          {data.invoice_title}
        </Heading>
      </div>

      <div className="grid gap-6 px-6 py-5 md:grid-cols-2">
        <div>
          <Text size="xsmall" weight="plus" className="mb-2 uppercase tracking-wide text-slate-500">
            Billed To
          </Text>
          <div className="space-y-1 text-sm text-slate-800">
            <p className="font-semibold">{data.billed_to.display_name}</p>
            <p>{data.billed_to.address}</p>
            <p>GSTIN: {data.billed_to.gstin || "—"}</p>
          </div>
        </div>
        <div>
          <Text size="xsmall" weight="plus" className="mb-2 uppercase tracking-wide text-slate-500">
            Billed From
          </Text>
          <div className="space-y-1 text-sm text-slate-800">
            <p className="font-semibold">{data.billed_from.name}</p>
            <p>GSTIN: {data.billed_from.gstin}</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto px-4 pb-6">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-[#4472C4] text-left text-white">
              <th className="px-3 py-2.5 font-semibold">SAC</th>
              <th className="px-3 py-2.5 font-semibold">Description</th>
              <th className="px-3 py-2.5 font-semibold text-right">Net Taxable</th>
              <th className="px-3 py-2.5 font-semibold text-right">GST</th>
              <th className="px-3 py-2.5 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.service_lines.map((line) => (
              <tr key={line.sac} className="border-b border-slate-200">
                <td className="px-3 py-2.5">{line.sac}</td>
                <td className="px-3 py-2.5">{line.description}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{line.net_taxable.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{line.gst_amount.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{line.total.toFixed(2)}</td>
              </tr>
            ))}
            <tr className="bg-blue-100/70 font-semibold">
              <td colSpan={2} className="px-3 py-2.5">
                Total
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {data.totals.net_taxable.toFixed(2)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {data.totals.gst_amount.toFixed(2)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {data.totals.grand_total.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </details>
)

const CommissionInvoicesPage = () => {
  const router = useRouter()
  const [range, setRange] = useState<InvoiceRange>("all")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [invoice, setInvoice] = useState<VendorCommissionInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exportingAll, setExportingAll] = useState(false)
  const [exportingOrderId, setExportingOrderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)

  const loadInvoice = useCallback(
    async (opts?: { background?: boolean }) => {
      const vendorToken = localStorage.getItem("vendor_token")
      if (!vendorToken) {
        router.push("/login")
        return
      }

      if (range === "custom" && (!customFrom || !customTo)) {
        setRangeError("Select both From and To dates, then click Apply")
        setLoading(false)
        return
      }

      setRangeError(null)
      if (opts?.background) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      try {
        const data = await vendorCommissionInvoicesApi.get({
          range,
          from: range === "custom" ? customFrom : undefined,
          to: range === "custom" ? customTo : undefined,
        })
        setInvoice(data)
        setError(null)
      } catch (e: any) {
        if (e.status === 403) {
          router.push("/pending")
          return
        }
        setError(e?.message || "Unable to load commission invoice. Please try again.")
        console.error("Commission invoice error:", e)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [router, range, customFrom, customTo]
  )

  useEffect(() => {
    if (range === "custom" && (!customFrom || !customTo)) return
    void loadInvoice({ background: !!invoice })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  useVendorLive({
    onInvalidate: () => {
      void loadInvoice({ background: true })
    },
  })

  const summary = useMemo(() => {
    if (!invoice) {
      return { orders: 0, commission: 0, shipping: 0, grandTotal: 0 }
    }
    const commission = invoice.orders.reduce((s, o) => s + o.commission_amount, 0)
    const shipping = invoice.orders.reduce((s, o) => s + o.logistic_fee, 0)
    return {
      orders: invoice.orders.length,
      commission,
      shipping,
      grandTotal: invoice.totals.grand_total,
    }
  }, [invoice])

  const handleRefresh = async () => {
    await loadInvoice({ background: true })
  }

  const handleApplyCustom = () => {
    if (!customFrom || !customTo) {
      setRangeError("Select both From and To dates")
      return
    }
    setRangeError(null)
    void loadInvoice()
  }

  const handleDownloadAll = async () => {
    if (!invoice || !invoice.orders.length) return
    setExportingAll(true)
    try {
      await downloadCommissionInvoicePdf(invoice)
    } catch (e: any) {
      setError(e?.message || "Failed to download invoice PDF")
    } finally {
      setExportingAll(false)
    }
  }

  const handleDownloadOrder = async (
    orderId: string,
    orderDisplayId: string | number | null
  ) => {
    if (!invoice) return
    setExportingOrderId(orderId)
    try {
      await downloadCommissionInvoicePdf(invoice, { orderId, orderDisplayId })
    } catch (e: any) {
      setError(e?.message || "Failed to download invoice PDF")
    } finally {
      setExportingOrderId(null)
    }
  }

  let content

  if (loading && !invoice) {
    content = <PageSkeleton label="Loading commission invoice…" stats={4} rows={6} cols={7} showAction />
  } else if (error && !invoice) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6">
        <Heading level="h1" className="text-2xl md:text-3xl">
          Commission Invoice
        </Heading>
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      </Container>
    )
  } else {
    content = (
      <Container className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              Commission Invoice
            </Heading>
            <Text className="mt-1 max-w-2xl text-ui-fg-subtle">
              Select a period, view delivered order numbers, and download Commission/Tax Invoice.
            </Text>
          </div>
          <Button variant="secondary" disabled={refreshing} onClick={handleRefresh}>
            <ArrowPath className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>

        <section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4 md:p-5">
          <Text size="small" weight="plus" className="mb-3">
            Select period
          </Text>
          <div className="flex flex-wrap gap-3">
            {RANGE_OPTIONS.map((opt) => (
              <RangeChip
                key={opt.id}
                active={range === opt.id}
                label={opt.label}
                hint={opt.hint}
                onClick={() => {
                  setRange(opt.id)
                  if (opt.id !== "custom") setRangeError(null)
                }}
              />
            ))}
          </div>

          {range === "custom" && (
            <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-ui-border-base/70 bg-ui-bg-subtle/40 p-4">
              <label className="flex flex-col gap-1">
                <Text size="xsmall" className="text-ui-fg-muted">
                  From
                </Text>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <Text size="xsmall" className="text-ui-fg-muted">
                  To
                </Text>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm"
                />
              </label>
              <Button variant="secondary" size="small" onClick={handleApplyCustom}>
                Apply
              </Button>
            </div>
          )}

          {rangeError && (
            <Text size="small" className="mt-3 text-ui-fg-error">
              {rangeError}
            </Text>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-base shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-border-base bg-ui-bg-subtle/40 px-4 py-4 md:px-6">
            <div>
              <Heading level="h2" className="text-lg">
                Delivered orders
              </Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {invoice?.period_label || "—"} · {summary.orders} order
                {summary.orders === 1 ? "" : "s"}
              </Text>
            </div>
            <Button
              variant="primary"
              disabled={!invoice?.orders.length || exportingAll}
              onClick={handleDownloadAll}
            >
              <ArrowDownTray />
              {exportingAll ? "Downloading…" : "Download all (PDF)"}
            </Button>
          </div>

          {!invoice?.orders.length ? (
            <div className="p-8">
              <EmptyState
                title="No delivered orders"
                description={
                  range === "custom" && (!customFrom || !customTo)
                    ? "Pick a custom date range and click Apply, or switch to All / 1 Month."
                    : "No delivered orders found for the selected period."
                }
                accent="blue"
                icon={<DocumentText />}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ui-border-base bg-[#4472C4]/10 text-ui-fg-base">
                    <th className="px-4 py-3 font-semibold md:px-6">Order No.</th>
                    <th className="px-4 py-3 font-semibold md:px-6">Delivered on</th>
                    <th className="px-4 py-3 font-semibold md:px-6">Product</th>
                    <th className="px-4 py-3 font-semibold text-right md:px-6">Sale</th>
                    <th className="px-4 py-3 font-semibold text-right md:px-6">Commission</th>
                    <th className="px-4 py-3 font-semibold text-right md:px-6">Shipping</th>
                    <th className="px-4 py-3 font-semibold text-right md:px-6">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.orders.map((row) => {
                    const orderLabel = row.order_display_id ? `#${row.order_display_id}` : "—"
                    const isExporting = exportingOrderId === row.order_id
                    return (
                      <tr
                        key={row.order_id}
                        className="border-b border-ui-border-base/60 transition-colors hover:bg-ui-bg-subtle/40"
                      >
                        <td className="px-4 py-3.5 md:px-6">
                          <span className="inline-flex rounded-md bg-ui-bg-subtle px-2.5 py-1 font-semibold tabular-nums text-ui-fg-base">
                            {orderLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-ui-fg-subtle md:px-6">
                          {formatDate(row.delivered_at)}
                        </td>
                        <td className="max-w-[14rem] truncate px-4 py-3.5 md:px-6">{row.product_name}</td>
                        <td className="px-4 py-3.5 text-right tabular-nums md:px-6">
                          {formatCurrency(row.sale_amount)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums md:px-6">
                          {formatCurrency(row.commission_amount)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums md:px-6">
                          {formatCurrency(row.logistic_fee)}
                        </td>
                        <td className="px-4 py-3.5 text-right md:px-6">
                          <Button
                            variant="secondary"
                            size="small"
                            disabled={isExporting}
                            onClick={() => handleDownloadOrder(row.order_id, row.order_display_id)}
                          >
                            <ArrowDownTray />
                            {isExporting ? "…" : "Download"}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Delivered orders" value={String(summary.orders)} icon={<DocumentText />} />
          <StatCard
            label="Commission (taxable)"
            value={formatCurrency(summary.commission)}
            icon={<DocumentText />}
          />
          <StatCard
            label="Shipping (taxable)"
            value={formatCurrency(summary.shipping)}
            icon={<DocumentText />}
          />
          <StatCard
            label="Invoice grand total"
            value={formatCurrency(summary.grandTotal)}
            icon={<DocumentText />}
          />
        </div>

        {invoice && invoice.orders.length > 0 && <InvoicePreview data={invoice} />}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <Text className="text-ui-fg-error">{error}</Text>
          </div>
        )}
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default CommissionInvoicesPage
