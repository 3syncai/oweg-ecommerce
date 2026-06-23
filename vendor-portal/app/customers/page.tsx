"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Container, Heading, Text, Button } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import EmptyState from "@/components/EmptyState"
import StatCard from "@/components/dashboard/StatCard"
import { vendorCustomersApi } from "@/lib/api/client"
import { CurrencyDollar, MagnifyingGlass, Users } from "@medusajs/icons"

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

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

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

  const stats = useMemo(() => {
    const revenue = customers.reduce((sum, c) => sum + c.total_spent, 0)
    const orders = customers.reduce((sum, c) => sum + c.orders_count, 0)
    return { total: customers.length, revenue, orders }
  }, [customers])

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return customers

    return customers.filter(
      (customer) =>
        customer.email?.toLowerCase().includes(query) ||
        customer.first_name?.toLowerCase().includes(query) ||
        customer.last_name?.toLowerCase().includes(query) ||
        customer.phone?.includes(query)
    )
  }, [customers, searchQuery])

  let content

  if (loading) {
    content = <PageSkeleton label="Loading customers…" stats={3} rows={6} cols={6} showAction={false} />
  } else if (error) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      </Container>
    )
  } else {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        <div className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              Customers
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              {stats.total > 0
                ? `${stats.total} customers · ${stats.orders} orders · ${formatCurrency(stats.revenue)} lifetime value`
                : "Customers who ordered your products"}
            </Text>
          </div>
        </div>

        {customers.length === 0 ? (
          <EmptyState
            accent="oweg"
            icon={<Users />}
            title="No customers yet"
            description="Customers will appear here once they place an order for your products."
            primaryAction={{ label: "View products", onClick: () => router.push("/products") }}
            secondaryAction={{ label: "Go to dashboard", onClick: () => router.push("/dashboard") }}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 animate-fade-in-up-slow">
              <StatCard icon={<Users />} label="Total customers" value={stats.total} subtext={<Text className="text-ui-fg-subtle">Unique buyers</Text>} />
              <StatCard icon={<Users />} label="Total orders" value={stats.orders} subtext={<Text className="text-ui-fg-subtle">Across all customers</Text>} />
              <StatCard variant="hero" icon={<CurrencyDollar />} label="Lifetime revenue" value={formatCurrency(stats.revenue)} subtext={<Text className="text-ui-fg-subtle">From repeat buyers</Text>} />
            </div>

            <div className="animate-fade-in-up relative w-full sm:max-w-sm">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-fg-muted" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by email or name…"
                className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ui-fg-muted focus:border-ui-border-strong"
              />
            </div>

            {filteredCustomers.length === 0 ? (
              <EmptyState
                accent="gray"
                icon={<MagnifyingGlass />}
                title="No customers found"
                description={`No customers match "${searchQuery}".`}
                primaryAction={{ label: "Clear search", onClick: () => setSearchQuery("") }}
              />
            ) : (
              <>
                <div className="animate-fade-in-up overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base">
                  <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_120px_100px_120px_120px] lg:gap-4 border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
                    {["Customer", "Email", "Phone", "Orders", "Total spent", "Last order"].map((h) => (
                      <Text key={h} size="small" weight="plus" className="text-ui-fg-subtle">{h}</Text>
                    ))}
                  </div>
                  <div className="divide-y divide-ui-border-base/70">
                    {filteredCustomers.map((customer) => {
                      const name =
                        customer.first_name || customer.last_name
                          ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
                          : "Guest"

                      return (
                        <div
                          key={customer.id}
                          className="grid grid-cols-1 gap-2 px-4 py-4 transition-colors hover:bg-ui-bg-subtle/60 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_120px_100px_120px_120px] lg:items-center lg:gap-4"
                        >
                          <Text weight="plus">{name}</Text>
                          <div className="lg:contents">
                            <Text size="small" className="truncate">{customer.email}</Text>
                            <Text size="small" className="text-ui-fg-subtle">{customer.phone || "N/A"}</Text>
                            <span className="inline-flex w-fit rounded-full border border-oweg-200/80 bg-oweg-50 px-2.5 py-0.5 text-xs font-medium text-oweg-800 dark:border-oweg-800/40 dark:bg-oweg-500/10 dark:text-oweg-300">
                              {customer.orders_count} order{customer.orders_count === 1 ? "" : "s"}
                            </span>
                            <Text weight="plus">{formatCurrency(customer.total_spent)}</Text>
                            <Text size="small" className="text-ui-fg-subtle">{formatDate(customer.last_order_date)}</Text>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <Text size="small" className="text-ui-fg-muted">
                  Showing {filteredCustomers.length} of {customers.length} customers
                </Text>
              </>
            )}
          </>
        )}
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorCustomersPage
