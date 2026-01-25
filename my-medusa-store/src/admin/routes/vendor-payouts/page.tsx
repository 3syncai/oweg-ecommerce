import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
import { Container, Heading, Button, Badge, Table, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

type Vendor = {
    id: string
    name: string
    email: string
    phone: string
    bank_name: string | null
    account_no: string | null
    ifsc_code: string | null
    is_approved: boolean
}

type PendingPayout = {
    vendor_id: string
    vendor_name: string
    total_revenue: number
    commission: number
    net_amount: number
    commission_rate: number
    order_count: number
    order_ids: string[]
}

const VendorPayoutsPage = () => {
    const [vendors, setVendors] = useState<Vendor[]>([])
    const [pendingPayouts, setPendingPayouts] = useState<Record<string, PendingPayout>>({})
    const [loading, setLoading] = useState(true)
    const [processingVendor, setProcessingVendor] = useState<string | null>(null)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        try {
            setLoading(true)

            // Fetch all approved vendors
            const vendorsRes = await fetch("/admin/vendors/all", {
                credentials: "include",
            })

            if (!vendorsRes.ok) {
                throw new Error("Failed to fetch vendors")
            }

            const vendorsData = await vendorsRes.json()
            const approvedVendors = vendorsData.vendors?.filter((v: Vendor) => v.is_approved) || []
            setVendors(approvedVendors)

            // Fetch pending payouts for each vendor
            const payoutPromises = approvedVendors.map(async (vendor: Vendor) => {
                try {
                    const res = await fetch(`/admin/vendor-payouts/calculate`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ vendor_id: vendor.id }),
                    })

                    if (!res.ok) return null

                    const data = await res.json()
                    return {
                        vendor_id: vendor.id,
                        data: data,
                    }
                } catch (err) {
                    console.error(`Failed to calculate payout for ${vendor.name}:`, err)
                    return null
                }
            })

            const results = await Promise.all(payoutPromises)
            const payoutsMap: Record<string, PendingPayout> = {}

            results.forEach((result) => {
                if (result && result.data) {
                    payoutsMap[result.vendor_id] = {
                        vendor_id: result.vendor_id,
                        vendor_name: result.data.vendor_name,
                        total_revenue: result.data.total_revenue || 0,
                        commission: result.data.commission || 0,
                        net_amount: result.data.net_amount || 0,
                        commission_rate: result.data.commission_rate || 0,
                        order_count: result.data.order_count || 0,
                        order_ids: result.data.order_ids || [],
                    }
                }
            })

            setPendingPayouts(payoutsMap)
        } catch (error) {
            console.error("Load data error:", error)
            toast.error("Failed to load vendors and payouts")
        } finally {
            setLoading(false)
        }
    }

    const handlePayNow = async (vendor: Vendor) => {
        const payout = pendingPayouts[vendor.id]
        if (!payout || payout.net_amount <= 0) {
            toast.warning("No pending amount to pay for this vendor")
            return
        }

        // Validate bank details
        if (!vendor.bank_name || !vendor.account_no || !vendor.ifsc_code) {
            toast.error(`Bank details missing for ${vendor.name}. Please update vendor information.`)
            return
        }

        const confirmed = confirm(
            `Pay ₹${payout.net_amount.toFixed(2)} to ${vendor.name}?\n\n` +
            `Bank: ${vendor.bank_name}\n` +
            `Account: ${vendor.account_no}\n` +
            `IFSC: ${vendor.ifsc_code}\n\n` +
            `Total Revenue: ₹${payout.total_revenue.toFixed(2)}\n` +
            `Commission (${payout.commission_rate}%): ₹${payout.commission.toFixed(2)}\n` +
            `Net Amount: ₹${payout.net_amount.toFixed(2)}\n` +
            `Orders: ${payout.order_count}`
        )

        if (!confirmed) return

        try {
            setProcessingVendor(vendor.id)

            const res = await fetch("/admin/vendor-payouts/razorpay/process", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    vendor_id: vendor.id,
                    amount: payout.net_amount,
                    commission_amount: payout.commission,
                    commission_rate: payout.commission_rate,
                    order_ids: payout.order_ids,
                    notes: `Payout for ${payout.order_count} orders`,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.message || data.error || "Payout failed")
            }

            toast.success(`✅ Payout processed! Status: ${data.payout.razorpay_status}`)

            // Reload data to update pending amounts
            setTimeout(() => loadData(), 2000)
        } catch (error: any) {
            console.error("Payout error:", error)
            toast.error(error.message || "Failed to process payout")
        } finally {
            setProcessingVendor(null)
        }
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            minimumFractionDigits: 0,
        }).format(amount)
    }

    if (loading) {
        return (
            <Container>
                <div className="flex items-center justify-center py-12">
                    <p className="text-gray-500">Loading vendors and payouts...</p>
                </div>
            </Container>
        )
    }

    return (
        <Container>
            <div className="flex items-center justify-between mb-6">
                <Heading level="h1">Vendor Payouts</Heading>
                <Button variant="secondary" size="small" onClick={loadData}>
                    Refresh
                </Button>
            </div>

            {vendors.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-gray-500">No approved vendors found</p>
                </div>
            ) : (
                <Table>
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell>Vendor</Table.HeaderCell>
                            <Table.HeaderCell>Bank Details</Table.HeaderCell>
                            <Table.HeaderCell>Orders</Table.HeaderCell>
                            <Table.HeaderCell>Revenue</Table.HeaderCell>
                            <Table.HeaderCell>Commission</Table.HeaderCell>
                            <Table.HeaderCell>Net Payout</Table.HeaderCell>
                            <Table.HeaderCell>Action</Table.HeaderCell>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {vendors.map((vendor) => {
                            const payout = pendingPayouts[vendor.id]
                            const hasPending = payout && payout.net_amount > 0
                            const hasBankDetails = vendor.bank_name && vendor.account_no && vendor.ifsc_code

                            return (
                                <Table.Row key={vendor.id}>
                                    <Table.Cell>
                                        <div>
                                            <p className="font-medium">{vendor.name}</p>
                                            <p className="text-xs text-gray-500">{vendor.email}</p>
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell>
                                        {hasBankDetails ? (
                                            <div className="text-sm">
                                                <p className="font-medium">{vendor.bank_name}</p>
                                                <p className="text-xs text-gray-500">
                                                    {vendor.account_no} • {vendor.ifsc_code}
                                                </p>
                                            </div>
                                        ) : (
                                            <Badge color="red">Missing</Badge>
                                        )}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {payout ? (
                                            <Badge color="blue">{payout.order_count}</Badge>
                                        ) : (
                                            <span className="text-gray-400">0</span>
                                        )}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {payout ? formatCurrency(payout.total_revenue) : "-"}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {payout ? (
                                            <span className="text-sm">
                                                {formatCurrency(payout.commission)}
                                                <span className="text-xs text-gray-500 ml-1">
                                                    ({payout.commission_rate}%)
                                                </span>
                                            </span>
                                        ) : (
                                            "-"
                                        )}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {payout && hasPending ? (
                                            <span className="font-semibold text-green-600">
                                                {formatCurrency(payout.net_amount)}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">₹0</span>
                                        )}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Button
                                            variant="primary"
                                            size="small"
                                            onClick={() => handlePayNow(vendor)}
                                            disabled={!hasPending || !hasBankDetails || processingVendor === vendor.id}
                                            isLoading={processingVendor === vendor.id}
                                        >
                                            {processingVendor === vendor.id ? "Processing..." : "Pay Now"}
                                        </Button>
                                    </Table.Cell>
                                </Table.Row>
                            )
                        })}
                    </Table.Body>
                </Table>
            )}
        </Container>
    )
}

export const config = defineRouteConfig({
    label: "Vendor Payouts",
    icon: CurrencyDollar,
})

export default VendorPayoutsPage
