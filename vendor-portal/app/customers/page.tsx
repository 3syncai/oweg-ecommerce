"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Container, Heading, Text, Table, Input, Badge } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import { vendorCustomersApi } from "@/lib/api/client"
import { MagnifyingGlass } from "@medusajs/icons"

type Customer = {
    id: string
    email: string
    first_name?: string
    last_name?: string
    phone?: string
    orders_count: number
    total_spent: number
    first_order_date: string
    last_order_date: string
}

const VendorCustomersPage = () => {
    const router = useRouter()
    const [customers, setCustomers] = useState<Customer[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")

    useEffect(() => {
        const vendorToken = localStorage.getItem("vendor_token")

        if (!vendorToken) {
            router.push("/login")
            return
        }

        const loadCustomers = async () => {
            try {
                const data = await vendorCustomersApi.list()
                setCustomers(data?.customers || [])
            } catch (e: any) {
                if (e.status === 403) {
                    router.push("/pending")
                    return
                }
                setError(e?.message || "Failed to load customers")
                console.error("Customers error:", e)
            } finally {
                setLoading(false)
            }
        }

        loadCustomers()
    }, [router])

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
        }).format(amount)
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-IN", {
            year: "numeric",
            month: "short",
            day: "numeric",
        })
    }

    const filteredCustomers = customers.filter(customer =>
        customer.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.last_name?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    let content

    if (loading) {
        content = (
            <Container className="p-6">
                <Text>Loading customers...</Text>
            </Container>
        )
    } else if (error) {
        content = (
            <Container className="p-6">
                <Text className="text-ui-fg-error">{error}</Text>
            </Container>
        )
    } else {
        content = (
            <Container className="p-6 space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <Heading level="h1">Customers</Heading>
                        <Text className="text-ui-fg-subtle">Customers who ordered your products</Text>
                    </div>

                    {customers.length > 0 && (
                        <div className="flex gap-4">
                            <div className="px-3 py-1.5 border border-ui-border-base rounded-md">
                                <Text className="text-ui-fg-subtle text-xs">Total Customers</Text>
                                <Text className="font-medium">{customers.length}</Text>
                            </div>
                            <div className="px-3 py-1.5 border border-ui-border-base rounded-md">
                                <Text className="text-ui-fg-subtle text-xs">Total Revenue</Text>
                                <Text className="font-medium">
                                    {formatCurrency(customers.reduce((sum, c) => sum + c.total_spent, 0))}
                                </Text>
                            </div>
                        </div>
                    )}
                </div>

                {customers.length > 0 && (
                    <div className="flex items-center gap-2 max-w-sm">
                        <div className="relative w-full">
                            <Input
                                placeholder="Search by email or name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-ui-fg-muted">
                                <MagnifyingGlass />
                            </div>
                        </div>
                    </div>
                )}

                {filteredCustomers.length === 0 ? (
                    <div className="p-8 text-center border border-ui-border-base rounded-lg border-dashed">
                        <Text className="text-ui-fg-subtle">
                            {searchQuery ? "No customers found matching your search" : "No customers yet"}
                        </Text>
                    </div>
                ) : (
                    <div className="border border-ui-border-base rounded-lg overflow-hidden">
                        <Table>
                            <Table.Header>
                                <Table.Row>
                                    <Table.HeaderCell>Customer</Table.HeaderCell>
                                    <Table.HeaderCell>Email</Table.HeaderCell>
                                    <Table.HeaderCell>Phone</Table.HeaderCell>
                                    <Table.HeaderCell>Orders</Table.HeaderCell>
                                    <Table.HeaderCell>Total Spent</Table.HeaderCell>
                                    <Table.HeaderCell>Last Order</Table.HeaderCell>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {filteredCustomers.map((customer) => (
                                    <Table.Row key={customer.id}>
                                        <Table.Cell>
                                            <div className="flex flex-col">
                                                <Text className="font-medium">
                                                    {customer.first_name || customer.last_name
                                                        ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
                                                        : 'Guest'}
                                                </Text>
                                            </div>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Text className="text-sm">{customer.email}</Text>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Text className="text-sm text-ui-fg-subtle">
                                                {customer.phone || 'N/A'}
                                            </Text>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Badge size="small" color="blue">
                                                {customer.orders_count} {customer.orders_count === 1 ? 'order' : 'orders'}
                                            </Badge>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Text className="font-medium">{formatCurrency(customer.total_spent)}</Text>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Text className="text-ui-fg-subtle text-sm">
                                                {formatDate(customer.last_order_date)}
                                            </Text>
                                        </Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    </div>
                )}
            </Container>
        )
    }

    return <VendorShell>{content}</VendorShell>
}

export default VendorCustomersPage
