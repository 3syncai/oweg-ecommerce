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
import { ChevronLeft, ChevronRight } from "lucide-react"

const PAGE_SIZE = 10

const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
]

function getIstYearMonthDay(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  }
}

function shiftCalendarMonth(year: number, month: number, delta: number) {
  let nextMonth = month + delta
  let nextYear = year
  while (nextMonth < 1) {
    nextMonth += 12
    nextYear -= 1
  }
  while (nextMonth > 12) {
    nextMonth -= 12
    nextYear += 1
  }
  return { year: nextYear, month: nextMonth }
}

/**
 * Auto invoice month = previous calendar month (IST).
 * Example: in October → September. Snapshot is finalized on the 7th;
 * before that the page still loads September (may be empty / live).
 */
function getAutoInvoiceMonth(d = new Date()) {
  const { year, month } = getIstYearMonthDay(d)
  return shiftCalendarMonth(year, month, -1)
}

function buildYearOptions(selectedYear: number) {
  const current = getIstYearMonthDay().year
  const start = Math.min(current - 4, selectedYear)
  const end = Math.max(current + 1, selectedYear)
  const years: number[] = []
  for (let y = end; y >= start; y -= 1) years.push(y)
  return years
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    Number(amount) || 0
  )

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

const MoneyCell = ({
  value,
  tone = "default",
}: {
  value: number | undefined
  tone?: "default" | "return" | "cancellation"
}) => (
  <td
    className={clx(
      "border border-ui-border-base/50 px-3 py-3 text-right tabular-nums whitespace-nowrap",
      tone === "return" && "text-red-600",
      tone === "cancellation" && "text-orange-600",
      tone === "default" && "text-ui-fg-base"
    )}
  >
    {formatCurrency(value || 0)}
  </td>
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
          {data.auto_generated ? " · Auto-generated on 7th" : ""}
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
      <div className="overflow-x-auto px-4 pb-6 pt-4">
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
            {data.service_lines.map((line, idx) => (
              <tr key={`${line.sac}-${line.description}-${idx}`} className="border-b border-slate-200">
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
  const defaults = getAutoInvoiceMonth()
  const [selectedMonth, setSelectedMonth] = useState(defaults.month)
  const [selectedYear, setSelectedYear] = useState(defaults.year)
  const [manualBrowse, setManualBrowse] = useState(false)
  const [invoice, setInvoice] = useState<VendorCommissionInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exportingAll, setExportingAll] = useState(false)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const yearOptions = useMemo(() => buildYearOptions(selectedYear), [selectedYear])
  const selectedMonthLabel =
    MONTH_OPTIONS.find((m) => m.value === selectedMonth)?.label || "Month"
  const autoMonth = getAutoInvoiceMonth()
  const isOnAutoMonth =
    selectedMonth === autoMonth.month && selectedYear === autoMonth.year

  const loadInvoice = useCallback(
    async (opts?: { background?: boolean }) => {
      const vendorToken = localStorage.getItem("vendor_token")
      if (!vendorToken) {
        router.push("/login")
        return
      }

      if (opts?.background) setRefreshing(true)
      else setLoading(true)

      try {
        const data = await vendorCommissionInvoicesApi.get({
          range: "month",
          month: selectedMonth,
          year: selectedYear,
        })
        setInvoice(data)
        setPage(1)
        setError(null)
      } catch (e: any) {
        if (e.status === 403) {
          router.push("/pending")
          return
        }
        setError(e?.message || "Unable to load commission invoice. Please try again.")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [router, selectedMonth, selectedYear]
  )

  // Keep month/year on the current auto billing cycle unless vendor browses history.
  useEffect(() => {
    const syncAutoMonth = () => {
      if (manualBrowse) return
      const next = getAutoInvoiceMonth()
      setSelectedMonth((prev) => (prev === next.month ? prev : next.month))
      setSelectedYear((prev) => (prev === next.year ? prev : next.year))
    }
    syncAutoMonth()
    const timer = window.setInterval(syncAutoMonth, 60_000)
    const onFocus = () => syncAutoMonth()
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", onFocus)
    }
  }, [manualBrowse])

  useEffect(() => {
    void loadInvoice({ background: !!invoice })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear])

  useVendorLive({
    onInvalidate: () => {
      void loadInvoice({ background: true })
    },
  })

  const shiftMonth = (delta: number) => {
    setManualBrowse(true)
    const next = shiftCalendarMonth(selectedYear, selectedMonth, delta)
    setSelectedMonth(next.month)
    setSelectedYear(next.year)
  }

  const jumpToAutoMonth = () => {
    setManualBrowse(false)
    const next = getAutoInvoiceMonth()
    setSelectedMonth(next.month)
    setSelectedYear(next.year)
  }

  const fees = invoice?.fee_summary
  const pageCount = Math.max(1, Math.ceil((invoice?.orders.length || 0) / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pagedOrders = useMemo(() => {
    const rows = invoice?.orders || []
    const start = (safePage - 1) * PAGE_SIZE
    return rows.slice(start, start + PAGE_SIZE)
  }, [invoice?.orders, safePage])

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

  let content

  if (loading && !invoice) {
    content = (
      <PageSkeleton label="Loading commission invoice…" stats={6} rows={6} cols={10} showAction />
    )
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
              Invoice month updates automatically after each month ends (ready on the 7th). Download
              the PDF below — no need to set month every time.
            </Text>
          </div>
          <Button variant="secondary" disabled={refreshing} onClick={() => void loadInvoice({ background: true })}>
            <ArrowPath className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>

        <section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4 md:p-5">
          <div className="max-w-xl rounded-xl border border-oweg-500/30 bg-oweg-500/[0.06] p-4">
            <Text size="small" weight="plus" className="mb-1">
              Invoice month
            </Text>
            <Text size="xsmall" className="mb-3 text-ui-fg-muted">
              {isOnAutoMonth
                ? "Auto-selected for the current billing cycle"
                : "Browsing history — tap Current cycle to jump back"}
            </Text>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <label className="flex min-w-[8.5rem] flex-col gap-1">
                <Text size="xsmall" className="text-ui-fg-muted">
                  Month
                </Text>
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setManualBrowse(true)
                    setSelectedMonth(Number(e.target.value))
                  }}
                  className="h-10 rounded-lg border border-ui-border-base bg-ui-bg-base px-3 text-sm font-medium"
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[6.5rem] flex-col gap-1">
                <Text size="xsmall" className="text-ui-fg-muted">
                  Year
                </Text>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setManualBrowse(true)
                    setSelectedYear(Number(e.target.value))
                  }}
                  className="h-10 rounded-lg border border-ui-border-base bg-ui-bg-base px-3 text-sm font-medium"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
              {!isOnAutoMonth ? (
                <Button variant="secondary" size="small" onClick={jumpToAutoMonth}>
                  Current cycle
                </Button>
              ) : null}
            </div>
            <Text size="small" weight="plus" className="mt-3 text-oweg-800 dark:text-oweg-300">
              {selectedMonthLabel} {selectedYear}
              {isOnAutoMonth ? " · Auto" : ""}
            </Text>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <StatCard label="Orders" value={String(invoice?.orders.length || 0)} icon={<DocumentText />} />
          <StatCard label="Sale" value={formatCurrency(fees?.sale_amount || 0)} icon={<DocumentText />} />
          <StatCard label="Product GST" value={formatCurrency(fees?.product_gst || 0)} icon={<DocumentText />} />
          <StatCard label="Commission" value={formatCurrency(fees?.commission || 0)} icon={<DocumentText />} />
          <StatCard label="Platform" value={formatCurrency(fees?.platform_fee || 0)} icon={<DocumentText />} />
          <StatCard label="Partner" value={formatCurrency(fees?.partner || 0)} icon={<DocumentText />} />
          <StatCard label="Logistics" value={formatCurrency(fees?.logistic_fee || 0)} icon={<DocumentText />} />
          <StatCard label="TCS + TDS" value={formatCurrency((fees?.tcs || 0) + (fees?.tds || 0))} icon={<DocumentText />} />
          <StatCard
            label="Reverse + Cancel"
            value={formatCurrency((fees?.reverse_logistic || 0) + (fees?.cancellation_fee || 0))}
            icon={<DocumentText />}
          />
          <StatCard
            label="Invoice grand total"
            value={formatCurrency(invoice?.totals.grand_total || 0)}
            icon={<DocumentText />}
          />
        </div>

        <section className="overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-base shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-border-base bg-ui-bg-subtle/40 px-4 py-4 md:px-6">
            <div>
              <Heading level="h2" className="text-lg">
                Tax & fee ledger
              </Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {invoice?.period_label || "—"} · {invoice?.orders.length || 0} entr
                {(invoice?.orders.length || 0) === 1 ? "y" : "ies"}
                {invoice?.auto_generated ? " · Snapshot ready from 7th" : ""}
              </Text>
            </div>
            <Button
              variant="primary"
              disabled={!invoice?.orders.length || exportingAll}
              onClick={() => void handleDownloadAll()}
            >
              <ArrowDownTray />
              {exportingAll ? "Downloading…" : "One-click PDF"}
            </Button>
          </div>

          {!invoice?.orders.length ? (
            <div className="p-8">
              <EmptyState
                title="No orders in this period"
                description="Browse another month, or wait until the 7th when the previous month’s invoice is ready."
                accent="blue"
                icon={<DocumentText />}
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-ui-border-base bg-ui-bg-subtle/80 text-[10px] uppercase tracking-wide text-ui-fg-muted">
                      <th className="border border-ui-border-base/70 px-3 py-2">Order</th>
                      <th className="border border-ui-border-base/70 px-3 py-2">Date</th>
                      <th className="border border-ui-border-base/70 px-3 py-2">Type</th>
                      <th className="border border-ui-border-base/70 px-3 py-2">Product</th>
                      <th className="border border-ui-border-base/70 px-3 py-2 text-right">Sale</th>
                      <th className="border border-ui-border-base/70 px-3 py-2 text-right">Prod GST</th>
                      <th className="border border-ui-border-base/70 px-3 py-2 text-right">GST %</th>
                      <th className="border border-ui-border-base/70 px-3 py-2 text-right">Logistics</th>
                      <th className="border border-ui-border-base/70 px-3 py-2 text-right">Platform</th>
                      <th className="border border-ui-border-base/70 px-3 py-2 text-right">Commission</th>
                      <th className="border border-ui-border-base/70 px-3 py-2 text-right">Partner</th>
                      <th className="border border-ui-border-base/70 px-3 py-2 text-right">TCS</th>
                      <th className="border border-ui-border-base/70 px-3 py-2 text-right">TDS</th>
                      <th className="border border-ui-border-base/70 px-3 py-2 text-right">Reverse</th>
                      <th className="border border-ui-border-base/70 px-3 py-2 text-right">Cancel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedOrders.map((row) => {
                      const tone =
                        row.category === "return"
                          ? "return"
                          : row.category === "cancellation"
                            ? "cancellation"
                            : "default"
                      return (
                        <tr key={`${row.order_id}-${row.category}-${row.delivered_at}`} className="hover:bg-ui-bg-subtle/40">
                          <td className="border border-ui-border-base/50 px-3 py-3 font-semibold">
                            {row.order_display_id ? `#${row.order_display_id}` : "—"}
                          </td>
                          <td className="border border-ui-border-base/50 px-3 py-3 text-ui-fg-subtle">
                            {formatDate(row.delivered_at)}
                          </td>
                          <td className="border border-ui-border-base/50 px-3 py-3">
                            <span
                              className={clx(
                                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                                row.category === "return" && "bg-red-500/10 text-red-700",
                                row.category === "cancellation" && "bg-orange-500/10 text-orange-700",
                                (!row.category || row.category === "sale") &&
                                  "bg-emerald-500/10 text-emerald-700"
                              )}
                            >
                              {row.category || "sale"}
                            </span>
                          </td>
                          <td className="max-w-[10rem] truncate border border-ui-border-base/50 px-3 py-3">
                            {row.product_name}
                          </td>
                          <MoneyCell value={row.sale_amount} tone={tone} />
                          <MoneyCell value={row.product_gst} tone={tone} />
                          <td
                            className={clx(
                              "border border-ui-border-base/50 px-3 py-3 text-right tabular-nums",
                              tone === "return" && "text-red-600",
                              tone === "cancellation" && "text-orange-600"
                            )}
                          >
                            {Number(row.product_gst_rate || 0)}%
                          </td>
                          <MoneyCell value={row.logistic_fee} tone={tone} />
                          <MoneyCell value={row.platform_fee} tone={tone} />
                          <MoneyCell value={row.commission_amount} tone={tone} />
                          <MoneyCell value={row.partner_commission} tone={tone} />
                          <MoneyCell value={row.tcs} tone={tone} />
                          <MoneyCell value={row.tds} tone={tone} />
                          <MoneyCell value={row.return_fee} tone={tone} />
                          <MoneyCell value={row.cancellation_fee} tone={tone} />
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2 border-t border-ui-border-base px-4 py-3 text-ui-fg-muted sm:flex-row sm:items-center sm:justify-between md:px-6">
                <Text size="small" className="tabular-nums">
                  Showing {pagedOrders.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}–
                  {Math.min(safePage * PAGE_SIZE, invoice.orders.length)} of {invoice.orders.length}
                </Text>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((v) => Math.max(1, v - 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 bg-ui-bg-base disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <Text size="small" className="min-w-[5.5rem] text-center tabular-nums">
                    Page {safePage} of {pageCount}
                  </Text>
                  <button
                    type="button"
                    disabled={safePage >= pageCount}
                    onClick={() => setPage((v) => Math.min(pageCount, v + 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 bg-ui-bg-base disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

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
