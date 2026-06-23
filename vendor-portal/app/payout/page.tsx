"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Button } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import StatCard from "@/components/dashboard/StatCard"
import StatusDot from "@/components/dashboard/StatusDot"
import GuideCard from "@/components/bulk-upload/GuideCard"
import { vendorOrdersApi } from "@/lib/api/client"
import { useRouter } from "next/navigation"
import { ArrowPath, CheckCircle, CurrencyDollar, Clock } from "@medusajs/icons"

type PayoutData = {
  totalRevenue: number
  totalBalance: number
  CreditedAmount: number
  pendingAmount: number
  totalOrders: number
  completedOrders: number
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

const VendorPayoutPage = () => {
  const router = useRouter()
  const [payoutData, setPayoutData] = useState<PayoutData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      router.push("/login")
      return
    }

    const loadPayoutData = async () => {
      try {
        const ordersData = await vendorOrdersApi.list()
        const orders = ordersData?.orders || []

        const totalRevenue = orders.reduce((sum: number, order: any) => sum + (order.total || 0), 0)
        const completedOrders = orders.filter(
          (o: any) => o.fulfillment_status === "shipped" || o.fulfillment_status === "delivered"
        ).length

        setPayoutData({
          totalRevenue,
          totalBalance: totalRevenue,
          CreditedAmount: 0,
          pendingAmount: 0,
          totalOrders: orders.length,
          completedOrders,
        })
      } catch (e: any) {
        if (e.status === 403) {
          router.push("/pending")
          return
        }
        setError(e?.message || "Failed to load payout data")
        console.error("Payout error:", e)
      } finally {
        setLoading(false)
      }
    }

    loadPayoutData()
  }, [router])

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
  } else if (payoutData) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        <div className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              Payout
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              {formatCurrency(payoutData.totalBalance)} available · {payoutData.completedOrders} completed orders
            </Text>
          </div>
          <Button variant="secondary" disabled>
            <ArrowPath />
            Request withdrawal
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in-up-slow">
          <StatCard
            icon={<CurrencyDollar />}
            label="Total revenue"
            value={formatCurrency(payoutData.totalRevenue)}
            subtext={<Text className="text-ui-fg-subtle">From {payoutData.totalOrders} orders</Text>}
          />
          <StatCard
            variant="hero"
            icon={<CheckCircle />}
            label="Available balance"
            value={formatCurrency(payoutData.totalBalance)}
            subtext={
              <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                <StatusDot variant="success" />
                <Text size="small">Ready to withdraw</Text>
              </span>
            }
          />
          <StatCard
            icon={<ArrowPath />}
            label="Credited"
            value={formatCurrency(payoutData.CreditedAmount)}
            subtext={<Text className="text-ui-fg-subtle">Total withdrawals</Text>}
          />
          <StatCard
            icon={<CheckCircle />}
            label="Completed orders"
            value={payoutData.completedOrders}
            subtext={<Text className="text-ui-fg-subtle">Of {payoutData.totalOrders} total</Text>}
          />
        </div>

        <GuideCard icon={<Clock />} title="Payout information" accent="oweg" className="animate-fade-in-up">
          <Text size="small" className="text-ui-fg-subtle">
            <span className="font-medium text-ui-fg-base">Payment schedule:</span> Payouts are processed weekly, typically on Fridays.
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            <span className="font-medium text-ui-fg-base">Processing time:</span> Withdrawals are credited within 7 business days.
          </Text>
        </GuideCard>

        <div className="animate-fade-in-up rounded-xl border border-dashed border-ui-border-base/80 bg-ui-bg-subtle/30 p-10 text-center">
          <Text weight="plus" className="text-ui-fg-base">
            No withdrawal history yet
          </Text>
          <Text size="small" className="mt-2 text-ui-fg-subtle">
            Your withdrawal history will appear here once you process your first payout.
          </Text>
        </div>
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorPayoutPage
