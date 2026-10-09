"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Container, Heading, Text, Button, clx } from "@medusajs/ui"
import { useRouter } from "next/navigation"
import { downloadPaymentLedgerExcel } from "@/lib/payment-ledger-export"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import EmptyState from "@/components/EmptyState"
import PaymentLedgerTable from "@/components/PaymentLedgerTable"
import StatCard from "@/components/dashboard/StatCard"
import { vendorPayoutsApi, type VendorPaymentsView } from "@/lib/api/client"
import { useVendorLive } from "@/lib/useVendorLive"
import { hasPageCache, peekPageCache, writePageCache } from "@/lib/page-cache"
import { ArrowPath, CurrencyDollar, Clock, ArchiveBox, ShoppingCart, Tag } from "@medusajs/icons"
import { ChevronLeft, ChevronRight } from "lucide-react"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

type ReportRange = "1d" | "1m" | "6m" | "1y" | "custom"
type LedgerFilter = "1m" | "3m" | "6m" | "1y" | "all"

const LEDGER_PAGE_SIZE = 10

const LEDGER_FILTERS: Array<{ key: LedgerFilter; label: string }> = [
  { key: "1m", label: "Last month" },
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "1y", label: "Yearly" },
  { key: "all", label: "All time" },
]

type SettlementRow = VendorPaymentsView["settlements"][number]

const startOfDayIst = (d: Date) => {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
  return new Date(`${key}T00:00:00+05:30`)
}

const endOfDayIst = (d: Date) => {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
  return new Date(`${key}T23:59:59.999+05:30`)
}

const resolveReportWindow = (
  range: ReportRange,
  customFrom: string,
  customTo: string
): { from: Date; to: Date; label: string } | { error: string } => {
  const now = new Date()
  const to = endOfDayIst(now)

  if (range === "1d") {
    return { from: startOfDayIst(now), to, label: "1-day" }
  }
  if (range === "1m") {
    const from = startOfDayIst(now)
    from.setMonth(from.getMonth() - 1)
    return { from, to, label: "1-month" }
  }
  if (range === "6m") {
    const from = startOfDayIst(now)
    from.setMonth(from.getMonth() - 6)
    return { from, to, label: "6-month" }
  }
  if (range === "1y") {
    const from = startOfDayIst(now)
    from.setFullYear(from.getFullYear() - 1)
    return { from, to, label: "1-year" }
  }

  if (!customFrom || !customTo) {
    return { error: "Select both From and To dates for a custom report" }
  }
  const from = new Date(`${customFrom}T00:00:00+05:30`)
  const customEnd = new Date(`${customTo}T23:59:59.999+05:30`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(customEnd.getTime())) {
    return { error: "Invalid custom date range" }
  }
  if (from.getTime() > customEnd.getTime()) {
    return { error: "From date must be before To date" }
  }
  return {
    from,
    to: customEnd,
    label: `custom-${customFrom}_to_${customTo}`,
  }
}

const filterSettlementsByRange = (rows: SettlementRow[], from: Date, to: Date) =>
  rows.filter((row) => {
    if (!row.delivered_at) return false
    const delivered = new Date(row.delivered_at).getTime()
    return delivered >= from.getTime() && delivered <= to.getTime()
  })

const isLedgerDisplayRow = (row: SettlementRow) => {
  const category = row.category || row.type
  return category !== "payment"
}

const resolveLedgerFilterWindow = (
  filter: LedgerFilter
): { from: Date; to: Date } | null => {
  if (filter === "all") return null
  const now = new Date()
  const to = endOfDayIst(now)
  const from = startOfDayIst(now)
  if (filter === "1m") from.setMonth(from.getMonth() - 1)
  else if (filter === "3m") from.setMonth(from.getMonth() - 3)
  else if (filter === "6m") from.setMonth(from.getMonth() - 6)
  else from.setFullYear(from.getFullYear() - 1)
  return { from, to }
}

const filterLedgerRows = (rows: SettlementRow[], filter: LedgerFilter) => {
  const displayRows = rows.filter(isLedgerDisplayRow)
  const window = resolveLedgerFilterWindow(filter)
  if (!window) return displayRows
  return filterSettlementsByRange(displayRows, window.from, window.to)
}

const downloadLedgerExcel = (rows: SettlementRow[], rangeLabel: string) => {
  downloadPaymentLedgerExcel(rows, rangeLabel)
}

/* ----------------------------------------------------------------
   MetricChip — glassmorphism style daily metric chips
   ---------------------------------------------------------------- */
const MetricChip = ({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string
  value: string
  tone?: "neutral" | "positive" | "negative"
  icon?: React.ReactNode
}) => (
  <div className={clx(
    "group relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-xl border px-4 py-3 transition-all duration-300 ease-out",
    "hover:-translate-y-0.5 hover:shadow-md",
    tone === "positive" && "border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 to-white hover:border-emerald-300/70 hover:shadow-emerald-500/[0.06] dark:border-emerald-800/30 dark:from-emerald-900/20 dark:to-transparent",
    tone === "negative" && "border-rose-200/50 bg-gradient-to-br from-rose-50/60 to-white hover:border-rose-300/60 hover:shadow-rose-500/[0.06] dark:border-rose-800/30 dark:from-rose-900/20 dark:to-transparent",
    tone === "neutral" && "border-ui-border-base/60 bg-gradient-to-br from-ui-bg-subtle/60 to-white hover:border-ui-border-strong hover:shadow-black/[0.04] dark:from-ui-bg-subtle/30 dark:to-transparent",
  )}>
    {/* Decorative corner accent */}
    <div className={clx(
      "absolute -right-3 -top-3 h-10 w-10 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100",
      tone === "positive" && "bg-emerald-400/10",
      tone === "negative" && "bg-rose-400/10",
      tone === "neutral" && "bg-oweg-400/10",
    )} />
    <div className="flex items-center gap-1.5">
      {icon && <span className="text-ui-fg-muted">{icon}</span>}
      <Text size="xsmall" className="uppercase tracking-widest text-ui-fg-muted font-medium">
        {label}
      </Text>
    </div>
    <Text
      weight="plus"
      size="small"
      className={clx(
        "truncate tabular-nums text-base font-bold",
        tone === "positive" && "text-emerald-700 dark:text-emerald-400",
        tone === "negative" && "text-rose-600 dark:text-rose-400",
        tone === "neutral" && "text-ui-fg-base"
      )}
    >
      {value}
    </Text>
  </div>
)

const PAYMENTS_CACHE_KEY = "payments"

/* ----------------------------------------------------------------
   Section heading with decorative left bar
   ---------------------------------------------------------------- */
const SectionHeading = ({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <div className="flex items-center gap-3">
      <div className="h-5 w-1 rounded-full bg-gradient-to-b from-oweg-400 to-oweg-600" />
      <div>
        <Text weight="plus" size="small" className="text-ui-fg-base">
          {title}
        </Text>
        {subtitle && (
          <Text size="xsmall" className="text-ui-fg-muted mt-0.5">
            {subtitle}
          </Text>
        )}
      </div>
    </div>
    {right}
  </div>
)

const VendorPayoutPage = () => {
  const router = useRouter()
  const cachedPayments = peekPageCache<VendorPaymentsView>(PAYMENTS_CACHE_KEY)
  const [payments, setPayments] = useState<VendorPaymentsView | null>(cachedPayments ?? null)
  const [loading, setLoading] = useState(() => !hasPageCache(PAYMENTS_CACHE_KEY))
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportRange, setReportRange] = useState<ReportRange>("1m")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [reportError, setReportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [feesInfoOpen, setFeesInfoOpen] = useState(false)
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("all")
  const [ledgerPage, setLedgerPage] = useState(1)

  const loadPayments = useCallback(async () => {
    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      router.push("/login")
      return
    }

    const hasCache = hasPageCache(PAYMENTS_CACHE_KEY)
    if (!hasCache) setLoading(true)

    try {
      const data = await vendorPayoutsApi.payments()
      setPayments(data)
      writePageCache(PAYMENTS_CACHE_KEY, data)
      setError(null)
    } catch (e: any) {
      if (e.status === 403) {
        router.push("/pending")
        return
      }
      if (
        e.status === 404 ||
        /cannot get \/vendor\/payouts\/payments/i.test(String(e?.message || ""))
      ) {
        setError(
          "Payments API is not available on the production backend yet. Redeploy the Medusa server so GET /vendor/payouts/payments is live."
        )
      } else {
        setError(e?.message || "Unable to load payments. Please refresh and try again.")
      }
      console.error("Payments error:", e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [router])

  useEffect(() => {
    void loadPayments()
  }, [loadPayments])

  useVendorLive({
    onInvalidate: () => {
      void loadPayments()
    },
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadPayments()
  }

  const reportPreviewCount = useMemo(() => {
    if (!payments?.settlements?.length) return 0
    const window = resolveReportWindow(reportRange, customFrom, customTo)
    if ("error" in window) return 0
    return filterSettlementsByRange(payments.settlements, window.from, window.to).length
  }, [payments, reportRange, customFrom, customTo])

  const filteredLedgerRows = useMemo(
    () => filterLedgerRows(payments?.settlements || [], ledgerFilter),
    [payments?.settlements, ledgerFilter]
  )

  const ledgerPageCount = Math.max(1, Math.ceil(filteredLedgerRows.length / LEDGER_PAGE_SIZE))
  const safeLedgerPage = Math.min(ledgerPage, ledgerPageCount)
  const pagedLedgerRows = useMemo(() => {
    const start = (safeLedgerPage - 1) * LEDGER_PAGE_SIZE
    return filteredLedgerRows.slice(start, start + LEDGER_PAGE_SIZE)
  }, [filteredLedgerRows, safeLedgerPage])

  useEffect(() => {
    setLedgerPage(1)
  }, [ledgerFilter])

  const handleDownloadReport = () => {
    if (!payments?.settlements) return
    setReportError(null)
    const window = resolveReportWindow(reportRange, customFrom, customTo)
    if ("error" in window) {
      setReportError(window.error)
      return
    }
    setExporting(true)
    try {
      const rows = filterSettlementsByRange(payments.settlements, window.from, window.to)
      downloadLedgerExcel(rows, window.label)
      setReportOpen(false)
    } catch (e: any) {
      setReportError(e?.message || "Failed to generate Excel report")
    } finally {
      setExporting(false)
    }
  }

  const unlockMinutes = payments?.unlock_minutes ?? 5

  let content

  if (loading && !payments) {
    content = <PageSkeleton label="Loading payments…" stats={9} rows={5} cols={12} showAction />
  } else if (error && !payments) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Heading level="h1" className="text-2xl md:text-3xl">
            Payments
          </Heading>
          <Button variant="secondary" disabled={refreshing} onClick={handleRefresh}>
            <ArrowPath className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
        <div className="mt-6 rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-50/80 to-white p-6 shadow-sm dark:from-red-900/10 dark:to-transparent">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      </Container>
    )
  } else if (payments) {
    const shippingFees =
      (payments.cards.logistic_fee || 0) + (payments.cards.return_fee || 0)

    const withdrawn = Number(payments.cards.withdrawn) || 0
    const pendingPayment = Number(payments.cards.pending_payment) || 0
    const unlockingPayment = Number(payments.cards.unlocking_payment) || 0

    // Derive lifetime cards from ledger when API fields are missing / stale
    const salesRows = payments.settlements.filter((row) => row.type === "sales")
    const fullSaleFromLedger = salesRows.reduce(
      (sum, row) => sum + (Number(row.order_amount) || 0),
      0
    )
    const tcsFromLedger = salesRows.reduce((sum, row) => sum + Math.abs(Number(row.tcs) || 0), 0)
    const tdsFromLedger = salesRows.reduce((sum, row) => sum + Math.abs(Number(row.tds) || 0), 0)
    const platformTotalFromLedger = salesRows.reduce(
      (sum, row) => sum + Math.abs(Number(row.platform_total) || 0),
      0
    )
    const commissionTotalFromLedger = salesRows.reduce(
      (sum, row) => sum + Math.abs(Number(row.commission_total) || 0),
      0
    )
    const partnerTotalFromLedger = salesRows.reduce(
      (sum, row) => sum + Math.abs(Number(row.partner_total) || 0),
      0
    )
    const logisticTotalFromLedger = salesRows.reduce(
      (sum, row) => sum + Math.abs(Number(row.logistic_total) || 0),
      0
    )

    const fullSale =
      Number(payments.cards.full_sale) > 0
        ? Number(payments.cards.full_sale)
        : fullSaleFromLedger
    const lifetimeTcs =
      Number(payments.cards.lifetime_tcs) > 0
        ? Number(payments.cards.lifetime_tcs)
        : tcsFromLedger
    const lifetimeTds =
      Number(payments.cards.lifetime_tds) > 0
        ? Number(payments.cards.lifetime_tds)
        : tdsFromLedger
    const lifetimePlatform = platformTotalFromLedger
    const lifetimeCommission = commissionTotalFromLedger
    const lifetimePartner = partnerTotalFromLedger
    const lifetimeLogistics = logisticTotalFromLedger
    const taxesAndCommission =
      lifetimePlatform +
      lifetimeCommission +
      lifetimePartner +
      lifetimeLogistics +
      lifetimeTcs +
      lifetimeTds

    // Rates from latest sale (admin-controlled; frozen per order).
    const rateSource =
      [...salesRows].reverse().find((row) => Math.abs(Number(row.platform_total) || 0) > 0) ||
      salesRows[salesRows.length - 1]
    const formatRate = (rate: number | undefined | null) => {
      const n = Number(rate)
      if (!Number.isFinite(n) || n <= 0) return null
      return `${n % 1 === 0 ? n.toFixed(0) : n}%`
    }
    const platformRateLabel = formatRate(rateSource?.platform_rate)
    const commissionRateLabel = formatRate(rateSource?.commission_rate)
    const partnerRateLabel = formatRate(rateSource?.partner_rate)
    const tcsRateLabel = formatRate(rateSource?.tcs_rate) || "0.5%"
    const tdsRateLabel = formatRate(rateSource?.tds_rate) || "0.1%"
    const logisticsRateLabel = null

    const settlementBalance =
      Number(payments.cards.settlement_balance) > 0
        ? Number(payments.cards.settlement_balance)
        : pendingPayment + withdrawn

    const balance =
      typeof payments.cards.balance === "number" &&
      (payments.cards.balance > 0 || pendingPayment === 0)
        ? Number(payments.cards.balance)
        : Math.max(0, settlementBalance - withdrawn)

    const moneyTone = (n: number, prefer: "positive" | "negative" | "neutral" = "neutral") => {
      if (n === 0) return "neutral" as const
      return prefer
    }

    content = (
      <Container className="mx-auto max-w-7xl space-y-8 p-4 md:p-6 lg:p-8">
        {/* Page header */}
        <div className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-oweg-400 to-oweg-600 text-white shadow-md shadow-oweg-500/20">
                <CurrencyDollar className="h-5 w-5" />
              </div>
              <Heading level="h1" className="text-2xl font-bold tracking-tight md:text-3xl">
                Payments
              </Heading>
            </div>
            <Text size="small" className="mt-2 max-w-xl text-ui-fg-subtle leading-relaxed">
              Settlement breakdown: listing total minus platform, commission, partner, logistics, TCS and TDS.
              Earnings unlock {unlockMinutes} minutes after delivery.
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!payments.settlements.length}
              className="rounded-xl transition-all duration-200 active:scale-[0.97] hover:shadow-sm"
              onClick={() => {
                setReportError(null)
                setReportOpen(true)
              }}
            >
              <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download report
            </Button>
            <Button
              variant="secondary"
              disabled={refreshing}
              className="rounded-xl transition-all duration-200 active:scale-[0.97] hover:shadow-sm"
              onClick={handleRefresh}
            >
              <ArrowPath className={clx("h-4 w-4", refreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* ── Balance cards ── */}
        <section
          className="animate-fade-in-up-slow space-y-4"
          style={{ animationDelay: "60ms" }}
        >
          <SectionHeading
            title="Balance"
            subtitle="Lifetime · not reset daily"
          />
          <div className="oweg-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <StatCard
              icon={<ShoppingCart />}
              label="Total sale"
              value={formatCurrency(fullSale)}
              subtext={
                <Text size="small" className="text-ui-fg-subtle">
                  All delivered sales
                </Text>
              }
            />
            <div className="relative">
              <StatCard
                icon={<Tag />}
                label="Total deduction"
                value={formatCurrency(taxesAndCommission)}
                className="pr-10"
              />
              <div
                className="absolute right-3 top-3 z-20"
                onMouseEnter={() => setFeesInfoOpen(true)}
                onMouseLeave={() => setFeesInfoOpen(false)}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFeesInfoOpen((open) => !open)
                  }}
                  className={clx(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold transition-all duration-200",
                    feesInfoOpen
                      ? "border-oweg-500/50 bg-oweg-500/10 text-oweg-700 shadow-sm dark:text-oweg-300"
                      : "border-ui-border-base bg-ui-bg-base text-ui-fg-subtle hover:border-oweg-300 hover:bg-oweg-50 hover:text-oweg-600"
                  )}
                  aria-expanded={feesInfoOpen}
                  aria-label="Total deduction breakdown"
                  title="Platform, commission, partner, logistics, TCS & TDS"
                >
                  i
                </button>
                <div
                  className={clx(
                    "oweg-popover absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-ui-border-base/60 bg-ui-bg-base p-4 shadow-xl shadow-black/[0.08]",
                    feesInfoOpen ? "oweg-popover-open" : "oweg-popover-closed"
                  )}
                  role="tooltip"
                >
                  <Text size="small" weight="plus" className="mb-3 text-ui-fg-base">
                    Breakdown
                  </Text>
                  <div className="space-y-1.5">
                    {[
                      {
                        label: "Platform fee",
                        rate: platformRateLabel,
                        val: lifetimePlatform,
                        color: "bg-blue-500",
                      },
                      {
                        label: "Commission",
                        rate: commissionRateLabel,
                        val: lifetimeCommission,
                        color: "bg-indigo-500",
                      },
                      {
                        label: "Partner fee",
                        rate: partnerRateLabel,
                        val: lifetimePartner,
                        color: "bg-rose-500",
                      },
                      {
                        label: "Logistics",
                        rate: logisticsRateLabel,
                        val: lifetimeLogistics,
                        color: "bg-emerald-500",
                      },
                      {
                        label: "TCS",
                        rate: tcsRateLabel,
                        val: lifetimeTcs,
                        color: "bg-amber-500",
                      },
                      {
                        label: "TDS",
                        rate: tdsRateLabel,
                        val: lifetimeTds,
                        color: "bg-purple-500",
                      },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl bg-ui-bg-subtle/60 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className={clx("h-2 w-2 shrink-0 rounded-full", item.color)} />
                          <div className="min-w-0">
                            <Text size="small" className="text-ui-fg-subtle">
                              {item.label}
                            </Text>
                            {item.rate ? (
                              <Text size="xsmall" className="tabular-nums text-ui-fg-muted">
                                {item.rate}
                              </Text>
                            ) : null}
                          </div>
                        </div>
                        <Text size="small" weight="plus" className="shrink-0 tabular-nums font-semibold">
                          {formatCurrency(item.val)}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <StatCard
              icon={<Clock />}
              label="Pending"
              value={formatCurrency(unlockingPayment)}
              subtext={
                <Text size="small" className="text-ui-fg-subtle">
                  Moves to settlement after {unlockMinutes} min
                </Text>
              }
            />
            <StatCard
              icon={<CurrencyDollar />}
              label="Settlement balance"
              value={formatCurrency(settlementBalance)}
              subtext={
                <Text size="small" className="text-ui-fg-subtle">
                  Unlocked from pending
                </Text>
              }
            />
            <StatCard
              icon={<ArchiveBox />}
              label="Withdrawn"
              value={formatCurrency(withdrawn)}
              subtext={
                <Text size="small" className="text-ui-fg-subtle">
                  Paid out to date
                </Text>
              }
            />
            <StatCard
              variant="hero"
              icon={<CurrencyDollar />}
              label="Balance"
              value={formatCurrency(balance)}
              subtext={
                <Text size="small" className="text-ui-fg-subtle">
                  Settlement − Withdrawn
                </Text>
              }
            />
          </div>

          <div className="rounded-xl border border-ui-border-base/40 bg-ui-bg-subtle/30 px-4 py-2.5">
            <Text size="xsmall" className="text-ui-fg-muted leading-relaxed">
              <span className="font-medium text-ui-fg-subtle">Formula:</span>{" "}
              Pending unlocks into Settlement after {unlockMinutes} min. Balance = Settlement −
              Withdrawn. Bank settlement = C − (D + E + F + B + TCS + TDS).
            </Text>
          </div>
        </section>

        {/* ── Today's activity ── */}
        <section
          className="animate-fade-in-up-slow space-y-4"
          style={{ animationDelay: "140ms" }}
        >
          <SectionHeading
            title="Today's activity"
            right={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ui-border-base/50 bg-ui-bg-subtle/50 px-3 py-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-oweg-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-oweg-500" />
                </span>
                <Text size="xsmall" className="text-ui-fg-muted font-medium">
                  Resets each day (IST)
                </Text>
              </span>
            }
          />
          <div className="oweg-stagger grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <MetricChip
              label="Total sale"
              value={formatCurrency(payments.cards.total_sale)}
              tone={moneyTone(payments.cards.total_sale, "positive")}
            />
            <MetricChip
              label="GST"
              value={formatCurrency(payments.cards.gst ?? 0)}
              tone={moneyTone(payments.cards.gst ?? 0, "neutral")}
            />
            <MetricChip
              label="Commission"
              value={formatCurrency(payments.cards.commission)}
              tone={moneyTone(payments.cards.commission, "negative")}
            />
            <MetricChip
              label="TCS"
              value={formatCurrency(payments.cards.tcs ?? 0)}
              tone={moneyTone(payments.cards.tcs ?? 0, "negative")}
            />
            <MetricChip
              label="TDS"
              value={formatCurrency(payments.cards.tds ?? 0)}
              tone={moneyTone(payments.cards.tds ?? 0, "negative")}
            />
            <MetricChip
              label="Platform fee"
              value={formatCurrency(payments.cards.platform_fee || 0)}
              tone={moneyTone(payments.cards.platform_fee || 0, "negative")}
            />
            <MetricChip
              label="Logistic fee"
              value={formatCurrency(shippingFees)}
              tone={moneyTone(shippingFees, "negative")}
            />
          </div>
          {(payments.cards.logistic_fee || payments.cards.return_fee) ? (
            <div className="flex items-center gap-2 rounded-lg bg-ui-bg-subtle/40 px-3 py-1.5">
              <div className="h-1 w-1 rounded-full bg-ui-fg-muted" />
              <Text size="xsmall" className="text-ui-fg-muted">
                Ship {formatCurrency(payments.cards.logistic_fee || 0)} · Return{" "}
                {formatCurrency(payments.cards.return_fee || 0)}
              </Text>
            </div>
          ) : null}
        </section>

        {/* ── Settlement ledger ── */}
        <section
          className="animate-fade-in-up space-y-4"
          style={{ animationDelay: "220ms" }}
        >
          <SectionHeading
            title="Settlement ledger"
            subtitle="Sale, return, claim, and cancellation rows including TCS and TDS. Bank settlement and payout details stay in the Excel download."
            right={
              filteredLedgerRows.length > 0 ? (
                <span className="inline-flex items-center rounded-full border border-ui-border-base/50 bg-ui-bg-subtle/50 px-3 py-1">
                  <Text size="xsmall" className="text-ui-fg-muted font-semibold tabular-nums">
                    {filteredLedgerRows.length} entr
                    {filteredLedgerRows.length === 1 ? "y" : "ies"}
                  </Text>
                </span>
              ) : null
            }
          />

          {(payments.settlements.filter(isLedgerDisplayRow).length > 0 ||
            filteredLedgerRows.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {LEDGER_FILTERS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setLedgerFilter(option.key)}
                  className={clx(
                    "rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all duration-200",
                    ledgerFilter === option.key
                      ? "border-oweg-500/40 bg-gradient-to-br from-oweg-500/15 to-oweg-500/5 text-oweg-800 shadow-sm shadow-oweg-500/10 dark:text-oweg-300"
                      : "border-ui-border-base/60 bg-ui-bg-base text-ui-fg-subtle hover:border-ui-border-strong hover:bg-ui-bg-subtle hover:shadow-sm"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {payments.settlements.filter(isLedgerDisplayRow).length === 0 ? (
            <EmptyState
              title="No settlement history yet"
              description="Delivered orders will appear here with a full settlement breakdown."
            />
          ) : filteredLedgerRows.length === 0 ? (
            <EmptyState
              title="No entries in this period"
              description="Try a wider date filter, or switch to All time."
            />
          ) : (
            <>
              <PaymentLedgerTable
                rows={pagedLedgerRows}
                onUnlock={() => void loadPayments()}
              />
              <div className="flex flex-col gap-2 text-ui-fg-muted sm:flex-row sm:items-center sm:justify-between">
                <Text size="small" className="tabular-nums">
                  Showing{" "}
                  {pagedLedgerRows.length
                    ? (safeLedgerPage - 1) * LEDGER_PAGE_SIZE + 1
                    : 0}
                  –{Math.min(safeLedgerPage * LEDGER_PAGE_SIZE, filteredLedgerRows.length)} of{" "}
                  {filteredLedgerRows.length}
                </Text>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safeLedgerPage <= 1}
                    onClick={() => setLedgerPage((value) => Math.max(1, value - 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 bg-ui-bg-base transition hover:border-ui-border-strong hover:bg-ui-bg-subtle disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <Text size="small" className="min-w-[5.5rem] text-center tabular-nums">
                    Page {safeLedgerPage} of {ledgerPageCount}
                  </Text>
                  <button
                    type="button"
                    disabled={safeLedgerPage >= ledgerPageCount}
                    onClick={() =>
                      setLedgerPage((value) => Math.min(ledgerPageCount, value + 1))
                    }
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 bg-ui-bg-base transition hover:border-ui-border-strong hover:bg-ui-bg-subtle disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ── Footer note ── */}
        <div className="rounded-2xl border border-ui-border-base/40 bg-gradient-to-r from-ui-bg-subtle/60 via-white to-ui-bg-subtle/60 px-5 py-4 dark:from-ui-bg-subtle/30 dark:via-transparent dark:to-ui-bg-subtle/30">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-oweg-500/10 text-oweg-600">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <Text size="small" className="leading-relaxed text-ui-fg-muted">
              Platform, commission, and partner fees include 18% GST. TCS and TDS show per row
              above. Download Excel for bank settlement, transaction ID, and payment date.
            </Text>
          </div>
        </div>

        {/* ── Report modal ── */}
        {reportOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
            <div
              className="w-full max-w-md animate-fade-in-up rounded-2xl border border-ui-border-base/60 bg-ui-bg-base p-6 shadow-2xl shadow-black/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-oweg-400 to-oweg-600 text-white">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <Heading level="h2" className="text-lg font-bold tracking-tight">
                  Download ledger report
                </Heading>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle ml-12">
                Export payment ledger in finance format (Excel .xlsx).
              </Text>

              <div className="mt-5 flex flex-wrap gap-2">
                {(
                  [
                    { key: "1d" as const, label: "1 day" },
                    { key: "1m" as const, label: "1 month" },
                    { key: "6m" as const, label: "6 months" },
                    { key: "1y" as const, label: "1 year" },
                    { key: "custom" as const, label: "Custom" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setReportRange(option.key)
                      setReportError(null)
                    }}
                    className={clx(
                      "rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all duration-200",
                      reportRange === option.key
                        ? "border-oweg-500/40 bg-gradient-to-br from-oweg-500/15 to-oweg-500/5 text-oweg-800 shadow-sm shadow-oweg-500/10 dark:text-oweg-300"
                        : "border-ui-border-base/60 bg-ui-bg-base text-ui-fg-subtle hover:border-ui-border-strong hover:bg-ui-bg-subtle hover:shadow-sm"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {reportRange === "custom" ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <Text size="small" weight="plus">
                      From
                    </Text>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="h-10 w-full rounded-xl border border-ui-border-base/60 bg-ui-bg-base px-3 text-sm outline-none transition-colors focus:border-oweg-500/50 focus:ring-2 focus:ring-oweg-500/10"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <Text size="small" weight="plus">
                      To
                    </Text>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-10 w-full rounded-xl border border-ui-border-base/60 bg-ui-bg-base px-3 text-sm outline-none transition-colors focus:border-oweg-500/50 focus:ring-2 focus:ring-oweg-500/10"
                    />
                  </label>
                </div>
              ) : null}

              <div className="mt-4 flex items-center gap-2 rounded-xl bg-ui-bg-subtle/50 px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-oweg-500/50" />
                <Text size="small" className="text-ui-fg-muted tabular-nums">
                  {reportPreviewCount} row{reportPreviewCount === 1 ? "" : "s"} in this period
                </Text>
              </div>

              {reportError ? (
                <div className="mt-2 rounded-xl border border-red-500/20 bg-red-50/50 px-3 py-2 dark:bg-red-900/10">
                  <Text size="small" className="text-ui-fg-error">
                    {reportError}
                  </Text>
                </div>
              ) : null}

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  disabled={exporting}
                  className="rounded-xl"
                  onClick={() => setReportOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  disabled={exporting}
                  isLoading={exporting}
                  className="rounded-xl"
                  onClick={handleDownloadReport}
                >
                  Download Excel
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Container>
    )
  } else {
    content = null
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorPayoutPage
