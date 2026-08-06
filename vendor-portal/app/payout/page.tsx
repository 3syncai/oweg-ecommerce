"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { Container, Heading, Text, Button, clx } from "@medusajs/ui"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import EmptyState from "@/components/EmptyState"
import PayoutUnlockTimer from "@/components/PayoutUnlockTimer"
import StatCard from "@/components/dashboard/StatCard"
import { vendorPayoutsApi, type VendorPaymentsView } from "@/lib/api/client"
import { ArrowPath, CurrencyDollar, Clock, ArchiveBox } from "@medusajs/icons"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

const formatDeduction = (amount: number) =>
  amount === 0 ? formatCurrency(0) : `-${formatCurrency(Math.abs(amount))}`

type ReportRange = "1d" | "1m" | "6m" | "1y" | "custom"

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

const downloadLedgerExcel = (rows: SettlementRow[], rangeLabel: string) => {
  const sheetRows = rows.map((row) => ({
    Date: row.delivered_at
      ? new Date(row.delivered_at).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        })
      : "",
    "Product Name": row.product_name,
    "Order Id": row.order_display_id ? `#${row.order_display_id}` : row.order_id,
    Type:
      row.type === "return" ? "Return" : row.type === "claim" ? "Claim" : "Sales",
    "Order Amount (₹)": row.order_amount,
    "Taxable (₹)": row.taxable_amount ?? 0,
    "GST (₹)": row.gst_amount ?? row.taxes ?? 0,
    "Commission (₹)": row.commission,
    "TCS (₹)": row.tcs ?? 0,
    "TDS (₹)": row.tds ?? 0,
    "Logistic (₹)": row.logistic_fee ?? 0,
    "Return fee (₹)": row.return_fee ?? 0,
    "Settlement Amount (₹)": row.settlement_amount,
    "Payout status":
      row.type === "return"
        ? "Reversed"
        : row.type === "claim"
          ? "Claim credit"
          : row.status === "ON_HOLD"
            ? "Return hold"
            : row.status === "UNLOCKING"
              ? "Pending"
              : row.status === "PAID"
                ? "Paid"
                : row.status === "CREDITED"
                  ? "Settlement amount"
                  : row.status || "",
  }))

  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(
    sheetRows.length
      ? sheetRows
      : [{ Note: "No settlement rows in the selected period" }]
  )
  XLSX.utils.book_append_sheet(workbook, sheet, "Ledger")
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `oweg-payments-ledger-${rangeLabel}-${stamp}.xlsx`)
}

const MetricChip = ({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "neutral" | "positive" | "negative"
}) => (
  <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-ui-border-base/60 bg-ui-bg-subtle/40 px-3 py-2.5">
    <Text size="xsmall" className="uppercase tracking-wide text-ui-fg-muted">
      {label}
    </Text>
    <Text
      weight="plus"
      size="small"
      className={clx(
        "truncate tabular-nums",
        tone === "positive" && "text-emerald-700 dark:text-emerald-400",
        tone === "negative" && "text-red-600 dark:text-red-400",
        tone === "neutral" && "text-ui-fg-base"
      )}
    >
      {value}
    </Text>
  </div>
)

const TypeBadge = ({ type }: { type: "sales" | "return" | "claim" }) => {
  const label = type === "return" ? "Return" : type === "claim" ? "Claim" : "Sales"
  return (
    <span
      className={clx(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
        type === "return" && "bg-red-500/10 text-red-700 dark:text-red-300",
        type === "claim" && "bg-amber-500/10 text-amber-800 dark:text-amber-300",
        type === "sales" && "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
      )}
    >
      {label}
    </span>
  )
}

const StatusPill = ({ children, tone }: { children: ReactNode; tone: string }) => (
  <span
    className={clx(
      "inline-flex max-w-[11rem] items-center rounded-full px-2.5 py-1 text-xs font-medium",
      tone
    )}
  >
    {children}
  </span>
)

const VendorPayoutPage = () => {
  const router = useRouter()
  const [payments, setPayments] = useState<VendorPaymentsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportRange, setReportRange] = useState<ReportRange>("1m")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [reportError, setReportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const loadPayments = useCallback(async () => {
    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      router.push("/login")
      return
    }

    try {
      const data = await vendorPayoutsApi.payments()
      setPayments(data)
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

  if (loading) {
    content = <PageSkeleton label="Loading payments…" stats={9} rows={5} cols={12} showAction />
  } else if (error) {
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
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      </Container>
    )
  } else if (payments) {
    const shippingFees =
      (payments.cards.logistic_fee || 0) + (payments.cards.return_fee || 0)

    const moneyTone = (n: number, prefer: "positive" | "negative" | "neutral" = "neutral") => {
      if (n === 0) return "neutral" as const
      return prefer
    }

    content = (
      <Container className="mx-auto max-w-7xl space-y-8 p-4 md:p-6">
        <div className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <Heading level="h1" className="text-2xl tracking-tight md:text-3xl">
              Payments
            </Heading>
            <Text size="small" className="mt-1.5 text-ui-fg-subtle">
              Earnings unlock {unlockMinutes} minutes after delivery. Courier fees are deducted from
              settlement.
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!payments.settlements.length}
              onClick={() => {
                setReportError(null)
                setReportOpen(true)
              }}
            >
              Download report
            </Button>
            <Button variant="secondary" disabled={refreshing} onClick={handleRefresh}>
              <ArrowPath className={refreshing ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        </div>

        <section className="animate-fade-in-up-slow space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <Text weight="plus" size="small" className="text-ui-fg-base">
              Balance
            </Text>
            <Text size="xsmall" className="text-ui-fg-muted">
              Lifetime · not reset daily
            </Text>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              variant="hero"
              icon={<CurrencyDollar />}
              label="Settlement amount"
              value={formatCurrency(payments.cards.pending_payment)}
              subtext={
                <Text size="small" className="text-ui-fg-subtle">
                  Available to pay out
                </Text>
              }
            />
            <StatCard
              icon={<Clock />}
              label="Pending"
              value={formatCurrency(payments.cards.unlocking_payment ?? 0)}
              subtext={
                <Text size="small" className="text-ui-fg-subtle">
                  {unlockMinutes} min after delivery
                </Text>
              }
            />
            <StatCard
              icon={<ArchiveBox />}
              label="Withdrawn"
              value={formatCurrency(payments.cards.withdrawn)}
              subtext={
                <Text size="small" className="text-ui-fg-subtle">
                  Paid out to date
                </Text>
              }
            />
            <div className="flex flex-col justify-center rounded-xl border border-ui-border-base/70 bg-ui-bg-subtle/30 p-5 oweg-card">
              <Text size="small" className="text-ui-fg-subtle">
                How settlement works
              </Text>
              <Text size="small" className="mt-2 leading-relaxed text-ui-fg-muted">
                Taxable − commission − TCS − TDS − logistic − return fee. Pending after unlock.
              </Text>
            </div>
          </div>
        </section>

        <section className="animate-fade-in-up-slow space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <Text weight="plus" size="small" className="text-ui-fg-base">
              Today&apos;s activity
            </Text>
            <Text size="xsmall" className="text-ui-fg-muted">
              Resets each day (IST)
            </Text>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <MetricChip
              label="Total sale"
              value={formatCurrency(payments.cards.total_sale)}
              tone={moneyTone(payments.cards.total_sale, "positive")}
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
              label="Logistic fee"
              value={formatCurrency(shippingFees)}
              tone={moneyTone(shippingFees, "negative")}
            />
          </div>
          {(payments.cards.logistic_fee || payments.cards.return_fee) ? (
            <Text size="xsmall" className="text-ui-fg-muted">
              Ship {formatCurrency(payments.cards.logistic_fee || 0)} · Return{" "}
              {formatCurrency(payments.cards.return_fee || 0)}
            </Text>
          ) : null}
        </section>

        <section className="animate-fade-in-up space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <Text weight="plus" size="small" className="text-ui-fg-base">
                Settlement ledger
              </Text>
              <Text size="xsmall" className="mt-0.5 text-ui-fg-muted">
                Full history of sales, returns, and claim credits
              </Text>
            </div>
            {payments.settlements.length > 0 ? (
              <Text size="xsmall" className="text-ui-fg-muted">
                {payments.settlements.length} entr
                {payments.settlements.length === 1 ? "y" : "ies"}
              </Text>
            ) : null}
          </div>

          {payments.settlements.length === 0 ? (
            <EmptyState
              title="No settlement history yet"
              description="Delivered orders will appear here with a full settlement breakdown."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ui-border-base bg-ui-bg-subtle/80">
                      {[
                        "Date",
                        "Product",
                        "Order",
                        "Type",
                        "Amount",
                        "Taxable",
                        "GST",
                        "Commission",
                        "TCS",
                        "TDS",
                        "Logistic",
                        "Return fee",
                        "Settlement",
                        "Status",
                      ].map((column) => (
                        <th
                          key={column}
                          scope="col"
                          className="whitespace-nowrap px-3 py-3 text-xs font-medium uppercase tracking-wide text-ui-fg-muted first:pl-4 last:pr-4"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ui-border-base/60">
                    {payments.settlements.map((row) => {
                      const isReturn = row.type === "return"
                      const isClaim = row.type === "claim"
                      const displayOrderId = row.order_display_id || row.order_id.slice(0, 8)
                      const isUnlocking = row.status === "UNLOCKING"
                      const isOnHold = row.status === "ON_HOLD"
                      const deliveredLabel = row.delivered_at
                        ? new Date(row.delivered_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"

                      const amountClass = clx(
                        "whitespace-nowrap px-3 py-3 tabular-nums font-medium",
                        isReturn && "text-red-600 dark:text-red-400",
                        isClaim && "text-amber-700 dark:text-amber-400",
                        !isReturn && !isClaim && "text-emerald-700 dark:text-emerald-400"
                      )

                      const deductionClass = (n: number) =>
                        clx(
                          "whitespace-nowrap px-3 py-3 tabular-nums",
                          n === 0 ? "text-ui-fg-muted" : "font-medium text-red-600 dark:text-red-400"
                        )

                      let statusNode: ReactNode
                      if (isReturn) {
                        statusNode = (
                          <StatusPill tone="bg-ui-bg-subtle text-ui-fg-muted">Reversed</StatusPill>
                        )
                      } else if (isClaim) {
                        statusNode = (
                          <StatusPill tone="bg-amber-500/10 text-amber-800 dark:text-amber-300">
                            Claim · pending
                          </StatusPill>
                        )
                      } else if (isOnHold) {
                        statusNode = (
                          <StatusPill tone="bg-amber-500/10 text-amber-800 dark:text-amber-300">
                            Return hold
                          </StatusPill>
                        )
                      } else if (isUnlocking && row.unlock_at) {
                        statusNode = (
                          <PayoutUnlockTimer
                            unlockAt={row.unlock_at}
                            onComplete={() => void loadPayments()}
                          />
                        )
                      } else if (row.status === "PAID") {
                        statusNode = (
                          <StatusPill tone="bg-ui-bg-subtle text-ui-fg-subtle">Paid</StatusPill>
                        )
                      } else {
                        statusNode = (
                          <StatusPill tone="bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                            Settlement amount
                          </StatusPill>
                        )
                      }

                      return (
                        <tr
                          key={row.id}
                          className="transition-colors hover:bg-ui-bg-subtle/50"
                        >
                          <td className="whitespace-nowrap px-3 py-3 first:pl-4 text-ui-fg-subtle">
                            {deliveredLabel}
                          </td>
                          <td className="max-w-[12rem] truncate px-3 py-3 font-medium text-ui-fg-base">
                            {row.product_name}
                          </td>
                          <td className="px-3 py-3">
                            {isClaim ? (
                              <span className="font-medium text-oweg-700 dark:text-oweg-300">
                                {displayOrderId}
                              </span>
                            ) : (
                              <Link
                                href={`/orders?order=${encodeURIComponent(row.order_id)}`}
                                className="font-medium text-oweg-700 underline-offset-2 hover:underline dark:text-oweg-300"
                              >
                                #{displayOrderId}
                              </Link>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <TypeBadge
                              type={isReturn ? "return" : isClaim ? "claim" : "sales"}
                            />
                          </td>
                          <td className={amountClass}>{formatCurrency(row.order_amount)}</td>
                          <td className="whitespace-nowrap px-3 py-3 tabular-nums text-ui-fg-base">
                            {formatCurrency(row.taxable_amount ?? 0)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 tabular-nums text-ui-fg-subtle">
                            {formatCurrency(row.gst_amount ?? row.taxes ?? 0)}
                          </td>
                          <td className={deductionClass(row.commission)}>
                            {formatDeduction(row.commission)}
                          </td>
                          <td className={deductionClass(row.tcs ?? 0)}>
                            {formatDeduction(row.tcs ?? 0)}
                          </td>
                          <td className={deductionClass(row.tds ?? 0)}>
                            {formatDeduction(row.tds ?? 0)}
                          </td>
                          <td className={deductionClass(row.logistic_fee ?? 0)}>
                            {formatDeduction(row.logistic_fee ?? 0)}
                          </td>
                          <td className={deductionClass(row.return_fee ?? 0)}>
                            {formatDeduction(row.return_fee ?? 0)}
                          </td>
                          <td className={clx(amountClass, "last:pr-4")}>
                            {formatCurrency(row.settlement_amount)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 last:pr-4">{statusNode}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <div className="rounded-xl border border-ui-border-base/50 bg-ui-bg-subtle/40 px-4 py-3">
          <Text size="small" className="leading-relaxed text-ui-fg-muted">
            Logistic fee is the courier rate at dispatch. Return fee is the reverse courier rate.
            Both reduce settlement.
          </Text>
        </div>

        {reportOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-[2px] sm:items-center">
            <div className="w-full max-w-md rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-2xl">
              <Heading level="h2" className="text-lg tracking-tight">
                Download ledger report
              </Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Export settlement history as Excel (.xlsx).
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
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      reportRange === option.key
                        ? "border-oweg-500/40 bg-oweg-500/10 text-oweg-800 dark:text-oweg-300"
                        : "border-ui-border-base/70 bg-ui-bg-base text-ui-fg-subtle hover:bg-ui-bg-subtle"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {reportRange === "custom" ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <Text size="small" weight="plus">
                      From
                    </Text>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base px-3 text-sm outline-none focus:border-ui-border-strong"
                    />
                  </label>
                  <label className="block space-y-1">
                    <Text size="small" weight="plus">
                      To
                    </Text>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base px-3 text-sm outline-none focus:border-ui-border-strong"
                    />
                  </label>
                </div>
              ) : null}

              <Text size="small" className="mt-3 text-ui-fg-muted">
                {reportPreviewCount} row{reportPreviewCount === 1 ? "" : "s"} in this period
              </Text>

              {reportError ? (
                <Text size="small" className="mt-2 text-ui-fg-error">
                  {reportError}
                </Text>
              ) : null}

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  disabled={exporting}
                  onClick={() => setReportOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  disabled={exporting}
                  isLoading={exporting}
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
