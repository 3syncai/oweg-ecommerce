"use client"

import { useCallback, useEffect, useState } from "react"
import { Container, Heading, Text, Button } from "@medusajs/ui"
import Link from "next/link"
import { useRouter } from "next/navigation"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import { vendorPayoutsApi, type VendorPaymentsView } from "@/lib/api/client"
import { ArrowPath } from "@medusajs/icons"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

const formatDeduction = (amount: number) =>
  amount === 0 ? formatCurrency(0) : `-${formatCurrency(Math.abs(amount))}`

const MetricCard = ({ label, value, valueClassName = "text-ui-fg-base" }: {
  label: string
  value: string
  valueClassName?: string
}) => (
  <div className="rounded-xl border border-ui-border-base/80 bg-ui-bg-base p-4 shadow-sm">
    <Text size="small" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text weight="plus" className={`mt-2 text-xl ${valueClassName}`}>
      {value}
    </Text>
  </div>
)

const VendorPayoutPage = () => {
  const router = useRouter()
  const [payments, setPayments] = useState<VendorPaymentsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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
      if (e.status === 404 || /cannot get \/vendor\/payouts\/payments/i.test(String(e?.message || ""))) {
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

  let content

  if (loading) {
    content = <PageSkeleton label="Loading payments…" stats={5} rows={5} cols={8} showAction />
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
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        <div className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              Payments
            </Heading>
          </div>
          <Button variant="secondary" disabled={refreshing} onClick={handleRefresh}>
            <ArrowPath className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 animate-fade-in-up-slow lg:grid-cols-5">
          <MetricCard label="Total Sale" value={formatCurrency(payments.cards.total_sale)} valueClassName="text-emerald-600" />
          <MetricCard label="Commission" value={formatCurrency(payments.cards.commission)} valueClassName="text-red-600" />
          <MetricCard label="Logistic Fee" value={formatCurrency(payments.cards.logistic_fee)} />
          <MetricCard label="Pending Payment" value={formatCurrency(payments.cards.pending_payment)} valueClassName="text-emerald-600" />
          <MetricCard label="Withdrawn" value={formatCurrency(payments.cards.withdrawn)} />
        </div>

        {payments.settlements.length === 0 ? (
          <div className="animate-fade-in-up rounded-xl border border-dashed border-ui-border-base/80 bg-ui-bg-subtle/30 p-10 text-center">
            <Text weight="plus">No deliveries today</Text>
          </div>
        ) : (
          <div className="animate-fade-in-up overflow-x-auto rounded-xl border border-ui-border-base/80 bg-ui-bg-base shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-blue-700 text-white">
                <tr>
                  {["Product Name", "Order Id", "Type", "Order Amount (₹)", "Commission (₹)", "Logistic Fee (₹)", "Taxes (₹)", "Settlement Amount (₹)"].map((column) => (
                    <th key={column} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.settlements.map((row, index) => {
                  const isReturn = row.type === "return"
                  const displayOrderId = row.order_display_id || row.order_id.slice(0, 8)
                  const orderAmount = isReturn ? -Math.abs(row.order_amount) : row.order_amount
                  const settlementAmount = isReturn ? 0 : row.settlement_amount

                  return (
                    <tr key={row.id} className={index % 2 === 0 ? "bg-ui-bg-base" : "bg-ui-bg-subtle/40"}>
                      <td className="max-w-60 px-4 py-3 font-medium text-ui-fg-base">{row.product_name}</td>
                      <td className="px-4 py-3">
                        <Link href={`/orders?order=${encodeURIComponent(row.order_id)}`} className="font-medium text-oweg-700 underline underline-offset-2 dark:text-oweg-300">
                          #{displayOrderId}
                        </Link>
                      </td>
                      <td className={`px-4 py-3 font-medium ${isReturn ? "text-red-600" : "text-emerald-600"}`}>
                        {isReturn ? "Return" : "Sales"}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 font-medium ${isReturn ? "text-red-600" : "text-emerald-600"}`}>
                        {formatCurrency(orderAmount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-red-600">{formatDeduction(row.commission)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatCurrency(row.logistic_fee)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatCurrency(row.taxes)}</td>
                      <td className={`whitespace-nowrap px-4 py-3 font-medium ${isReturn ? "text-red-600" : "text-emerald-600"}`}>
                        {formatCurrency(settlementAmount)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <Text size="small" className="text-ui-fg-subtle italic">
          Vendors can click on order id to get full report of the particular settlement amount.
        </Text>
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorPayoutPage
