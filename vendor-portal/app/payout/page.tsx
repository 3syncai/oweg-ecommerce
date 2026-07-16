"use client"

import { useCallback, useEffect, useState } from "react"
import { Container, Heading, Text, Button } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import StatCard from "@/components/dashboard/StatCard"
import StatusDot from "@/components/dashboard/StatusDot"
import GuideCard from "@/components/bulk-upload/GuideCard"
import PayoutUnlockTimer from "@/components/PayoutUnlockTimer"
import { vendorPayoutsApi, type VendorEarningsSummary } from "@/lib/api/client"
import { useRouter } from "next/navigation"
import { ArrowPath, CheckCircle, CurrencyDollar, Clock } from "@medusajs/icons"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

function OrderCommissionLines({
  grossAmount,
  commissionAmount,
  commissionRate,
  netAmount,
  netPrefix = "",
  netClassName = "text-emerald-600 font-medium",
}: {
  grossAmount?: number
  commissionAmount?: number
  commissionRate?: number
  netAmount: number
  netPrefix?: string
  netClassName?: string
}) {
  const hasBreakdown =
    typeof grossAmount === "number" &&
    grossAmount > 0 &&
    (typeof commissionAmount === "number" || typeof commissionRate === "number")

  if (!hasBreakdown) {
    return (
      <Text className={netClassName}>
        {netPrefix}
        {formatCurrency(netAmount)}
      </Text>
    )
  }

  const commission = Number(commissionAmount) || 0
  const rate = Number(commissionRate) || 0

  return (
    <div className="text-right">
      <Text className={netClassName}>
        {netPrefix}
        {formatCurrency(netAmount)}
      </Text>
      <Text size="small" className="text-ui-fg-subtle mt-0.5">
        Sale {formatCurrency(grossAmount!)}
        {commission > 0 || rate > 0
          ? ` · Commission ${rate > 0 ? `${rate}%` : ""} −${formatCurrency(commission)}`
          : " · No commission"}
      </Text>
    </div>
  )
}

const VendorPayoutPage = () => {
  const router = useRouter()
  const [summary, setSummary] = useState<VendorEarningsSummary | null>(null)
  const [unlockMinutes, setUnlockMinutes] = useState(5)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadSummary = useCallback(async (sync = false) => {
    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      router.push("/login")
      return
    }

    try {
      const data = sync ? await vendorPayoutsApi.sync() : await vendorPayoutsApi.summary()
      setSummary(data.summary)
      setUnlockMinutes(data.unlock_minutes ?? 5)
      setError(null)
    } catch (e: any) {
      if (e.status === 403) {
        router.push("/pending")
        return
      }
      if (e.status === 404 || /cannot get \/vendor\/payouts/i.test(String(e?.message || ""))) {
        setError(
          "Payout API is missing on the production Medusa backend. Redeploy Medusa so /vendor/payouts returns the earnings summary."
        )
      } else {
        setError(e?.message || "Failed to load payout data")
      }
      console.error("Payout error:", e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [router])

  useEffect(() => {
    void loadSummary(false)
  }, [loadSummary])

  useEffect(() => {
    if (!summary?.unlocking.length) return
    const intervalId = window.setInterval(() => {
      void loadSummary(true)
    }, 15000)
    return () => window.clearInterval(intervalId)
  }, [summary?.unlocking.length, loadSummary])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadSummary(true)
  }

  const handleTimerComplete = () => {
    void loadSummary(true)
  }

  let content

  if (loading) {
    content = <PageSkeleton label="Loading payout data…" stats={4} rows={0} cols={0} showAction />
  } else if (error) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      </Container>
    )
  } else if (summary) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        <div className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              Payout
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              {formatCurrency(summary.available_balance)} available
              {summary.unlocking_balance > 0
                ? ` · ${formatCurrency(summary.unlocking_balance)} unlocking`
                : ""}
              {summary.reversed_total !== 0
                ? ` · ${formatCurrency(Math.abs(summary.reversed_total))} cancelled / returned`
                : ""}
            </Text>
          </div>
          <Button variant="secondary" disabled={refreshing} onClick={handleRefresh}>
            <ArrowPath className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in-up-slow">
          <StatCard
            variant="hero"
            icon={<CheckCircle />}
            label="Available balance"
            value={formatCurrency(summary.available_balance)}
            subtext={
              <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                <StatusDot variant="success" />
                <Text size="small">Ready for withdrawal</Text>
              </span>
            }
          />
          <StatCard
            icon={<Clock />}
            label="Unlocking"
            value={formatCurrency(summary.unlocking_balance)}
            subtext={
              <Text className="text-ui-fg-subtle">
                {summary.unlocking.length} order{summary.unlocking.length === 1 ? "" : "s"} in {unlockMinutes}-min hold
              </Text>
            }
          />
          <StatCard
            icon={<CurrencyDollar />}
            label="Total credited"
            value={formatCurrency(summary.total_credited)}
            subtext={<Text className="text-ui-fg-subtle">After delivery unlock</Text>}
          />
          <StatCard
            icon={<ArrowPath />}
            label="Withdrawn"
            value={formatCurrency(summary.total_withdrawn)}
            subtext={<Text className="text-ui-fg-subtle">Processed payouts</Text>}
          />
        </div>

        {summary.unlocking.length > 0 ? (
          <div className="animate-fade-in-up overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base">
            <div className="border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
              <Heading level="h2" className="text-base">
                Unlocking to payout
              </Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Delivered orders credit to your payout balance after a {unlockMinutes}-minute timer.
              </Text>
            </div>
            <div className="divide-y divide-ui-border-base/70">
              {summary.unlocking.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <Text weight="plus">
                      Order #{item.order_display_id || item.order_id.slice(0, 8)}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      After unlock this credits to your available balance
                    </Text>
                  </div>
                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    <OrderCommissionLines
                      grossAmount={item.gross_amount}
                      commissionAmount={item.commission_amount}
                      commissionRate={item.commission_rate}
                      netAmount={item.net_amount}
                    />
                    <PayoutUnlockTimer unlockAt={item.unlock_at} onComplete={handleTimerComplete} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {summary.reversed_recent.length > 0 ? (
          <div className="animate-fade-in-up overflow-hidden rounded-xl border border-red-500/20 bg-red-500/5">
            <div className="border-b border-red-500/20 bg-red-500/5 px-4 py-3">
              <Heading level="h2" className="text-base">
                Returned orders
              </Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Cancelled or returned orders are not credited (₹0 payout).
              </Text>
            </div>
            <div className="divide-y divide-red-500/10">
              {summary.reversed_recent.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <Text weight="plus">
                    Order #{item.order_display_id || item.order_id.slice(0, 8)}
                  </Text>
                  <Text className="text-ui-fg-muted font-medium">₹0 · no credit</Text>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {summary.credited_recent.length > 0 ? (
          <div className="animate-fade-in-up overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base">
            <div className="border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
              <Heading level="h2" className="text-base">
                Recently credited
              </Heading>
            </div>
            <div className="divide-y divide-ui-border-base/70">
              {summary.credited_recent.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <Text weight="plus">
                    Order #{item.order_display_id || item.order_id.slice(0, 8)}
                  </Text>
                  <OrderCommissionLines
                    grossAmount={item.gross_amount}
                    commissionAmount={item.commission_amount}
                    commissionRate={item.commission_rate}
                    netAmount={item.net_amount}
                    netPrefix="+"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          summary.reversed_recent.length === 0 ? (
          <div className="animate-fade-in-up rounded-xl border border-dashed border-ui-border-base/80 bg-ui-bg-subtle/30 p-10 text-center">
            <Text weight="plus" className="text-ui-fg-base">
              No credited earnings yet
            </Text>
            <Text size="small" className="mt-2 text-ui-fg-subtle">
              When orders are delivered, earnings appear here after the {unlockMinutes}-minute unlock period.
            </Text>
          </div>
          ) : null
        )}

        <GuideCard icon={<Clock />} title="Payout unlock" accent="oweg" className="animate-fade-in-up">
          <Text size="small" className="text-ui-fg-subtle">
            <span className="font-medium text-ui-fg-base">After delivery:</span> a {unlockMinutes}-minute timer starts before the order amount is credited to your available payout balance. Platform commission is deducted from the sale before credit.
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            <span className="font-medium text-ui-fg-base">Commission:</span> each order shows sale amount, commission cut, and your net credit so you always know what was deducted.
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            <span className="font-medium text-ui-fg-base">Returns:</span> if an order is returned during or after the unlock period, the payout is reversed and shown as a negative amount. It is never credited to your balance.
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            <span className="font-medium text-ui-fg-base">Withdrawals:</span> request a payout from your available balance once admin processing is enabled.
          </Text>
        </GuideCard>
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorPayoutPage
