"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Button, Badge } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import { vendorOrdersApi } from "@/lib/api/client"
import { useRouter } from "next/navigation"
import { CurrencyDollar, ArrowPath, CheckCircle } from "@medusajs/icons"

type PayoutData = {
    totalRevenue: number
    totalBalance: number
    CreditedAmount: number
    pendingAmount: number
    totalOrders: number
    completedOrders: number
}

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

                const totalRevenue = orders.reduce((sum: number, order: any) => {
                    return sum + (order.total || 0)
                }, 0)

                const completedOrders = orders.filter((o: any) =>
                    o.fulfillment_status === 'shipped' || o.fulfillment_status === 'delivered'
                ).length

                // For now, all revenue is in balance
                // In the future, you can subtract withdrawn amounts
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

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
        }).format(amount)
    }

    let content

    if (loading) {
        content = (
            <Container className="p-6">
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ui-fg-base mx-auto mb-4"></div>
                        <Text className="text-ui-fg-subtle">Loading payout data...</Text>
                    </div>
                </div>
            </Container>
        )
    } else if (error) {
        content = (
            <Container className="p-6">
                <Text className="text-ui-fg-error">{error}</Text>
            </Container>
        )
    } else if (payoutData) {
        content = (
            <Container className="p-6 space-y-6 max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <Heading level="h1">Payout</Heading>
                        <Text className="text-ui-fg-subtle">Manage your earnings and withdrawals</Text>
                    </div>
                    <Button variant="secondary" disabled>
                        <ArrowPath />
                        Request Withdrawal
                    </Button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Total Revenue */}
                    <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-md bg-blue-50 dark:bg-blue-950">
                                <CurrencyDollar className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <Text className="text-ui-fg-subtle text-sm">Total Revenue</Text>
                        </div>
                        <Heading level="h2" className="text-2xl">
                            {formatCurrency(payoutData.totalRevenue)}
                        </Heading>
                        <Text className="text-ui-fg-subtle text-xs mt-2">
                            From {payoutData.totalOrders} orders
                        </Text>
                    </div>

                    {/* Total Balance */}
                    <div className="p-6 border border-green-500/20 bg-green-500/5 rounded-lg">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-md bg-green-500/10">
                                <CheckCircle className="text-green-600" />
                            </div>
                            <Text className="text-ui-fg-subtle text-sm">Available Balance</Text>
                        </div>
                        <Heading level="h2" className="text-2xl text-green-700 dark:text-green-400">
                            {formatCurrency(payoutData.totalBalance)}
                        </Heading>
                        <Text className="text-ui-fg-subtle text-xs mt-2">
                            Ready to withdraw
                        </Text>
                    </div>

                    {/* Withdrawn Amount */}
                    <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-md bg-ui-bg-base-hover">
                                <ArrowPath className="text-ui-fg-muted" />
                            </div>
                            <Text className="text-ui-fg-subtle text-sm">Credited</Text>
                        </div>
                        <Heading level="h2" className="text-2xl">
                            {formatCurrency(payoutData.CreditedAmount)}
                        </Heading>
                        <Text className="text-ui-fg-subtle text-xs mt-2">
                            Total withdrawals
                        </Text>
                    </div>

                    {/* Completed Orders */}
                    <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-md bg-ui-bg-base-hover">
                                <CheckCircle className="text-ui-fg-muted" />
                            </div>
                            <Text className="text-ui-fg-subtle text-sm">Completed Orders</Text>
                        </div>
                        <Heading level="h2" className="text-2xl">
                            {payoutData.completedOrders}
                        </Heading>
                        <Text className="text-ui-fg-subtle text-xs mt-2">
                            Of {payoutData.totalOrders} total orders
                        </Text>
                    </div>
                </div>

                {/* Payout Information */}
                <div className="border border-ui-border-base rounded-lg bg-ui-bg-base p-6">
                    <Heading level="h3" className="mb-4">Payout Information</Heading>
                    <div className="space-y-4 text-sm">
                        <div className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-ui-fg-subtle mt-2"></div>
                            <div>
                                <Text className="font-medium">Payment Schedule</Text>
                                <Text className="text-ui-fg-subtle">
                                    Payouts are processed on a weekly basis, typically on Fridays
                                </Text>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-ui-fg-subtle mt-2"></div>
                            <div>
                                <Text className="font-medium">Processing Time</Text>
                                <Text className="text-ui-fg-subtle">
                                    Credit Amount are typically processed within 7 business days
                                </Text>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Placeholder for future withdrawal history table */}
                <div className="border border-ui-border-base rounded-lg bg-ui-bg-base p-6 text-center">
                    <Text className="text-ui-fg-subtle">No withdrawal history yet</Text>
                    <Text className="text-ui-fg-subtle text-sm mt-2">
                        Your withdrawal history will appear here once you process your first payout
                    </Text>
                </div>
            </Container>
        )
    }

    return <VendorShell>{content}</VendorShell>
}

export default VendorPayoutPage
