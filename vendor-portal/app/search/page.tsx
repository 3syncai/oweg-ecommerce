"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { MagnifyingGlass, ShoppingCart, Tag, Users } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import EmptyState from "@/components/EmptyState"
import StatCard from "@/components/dashboard/StatCard"
import StatusDot, { fulfillmentStatusVariant } from "@/components/dashboard/StatusDot"
import ProductStatus from "@/components/dashboard/ProductStatus"
import {
  vendorCustomersApi,
  vendorOrdersApi,
  vendorProductsApi,
} from "@/lib/api/client"

type SearchTab = "all" | "products" | "orders" | "customers"

type Product = {
  id: string
  title: string
  handle?: string
  status?: string
  thumbnail?: string
  images?: Array<{ url?: string }>
  metadata?: {
    approval_status?: string
  }
  created_at?: string
}

type Order = {
  id: string
  display_id?: string
  email?: string
  fulfillment_status?: string
  created_at?: string
  total?: number
  items?: Array<{ title?: string }>
}

type Customer = {
  id: string
  email?: string
  first_name?: string
  last_name?: string
  orders_count?: number
  total_spent?: number
  last_order_date?: string
}

const RECENT_KEY = "vendor_portal_recent_searches"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

const formatDate = (dateString?: string) => {
  if (!dateString) return "—"
  return new Date(dateString).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

const getProductStatus = (p: Product) => {
  if (p.metadata?.approval_status === "pending") return "pending"
  if (p.metadata?.approval_status === "rejected") return "rejected"
  if (p.status === "published") return "published"
  return "draft"
}

export default function VendorSearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState<SearchTab>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "pending" | "draft" | "rejected">("all")

  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  useEffect(() => {
    const token = localStorage.getItem("vendor_token")
    if (!token) {
      router.push("/login")
      return
    }

    try {
      const fromStorage = localStorage.getItem(RECENT_KEY)
      if (fromStorage) {
        const parsed = JSON.parse(fromStorage)
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.filter(Boolean).slice(0, 6))
        }
      }
    } catch {
      // Ignore malformed localStorage entries.
    }

    const loadData = async () => {
      try {
        setLoading(true)
        const [productsData, ordersData, customersData] = await Promise.all([
          vendorProductsApi.list().catch(() => ({ products: [] })),
          vendorOrdersApi.list().catch(() => ({ orders: [] })),
          vendorCustomersApi.list().catch(() => ({ customers: [] })),
        ])

        setProducts(productsData?.products || [])
        setOrders(ordersData?.orders || [])
        setCustomers(customersData?.customers || [])
      } catch (e: any) {
        if (e?.status === 403) {
          router.push("/pending")
          return
        }
        setError(e?.message || "Failed to load search data")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [router])

  const normalizedQuery = query.trim().toLowerCase()

  const productResults = useMemo(() => {
    const base = products.filter((p) => {
      if (!normalizedQuery) return true
      return (
        p.title?.toLowerCase().includes(normalizedQuery) ||
        p.handle?.toLowerCase().includes(normalizedQuery) ||
        p.id?.toLowerCase().includes(normalizedQuery)
      )
    })

    if (statusFilter === "all") return base

    return base.filter((p) => {
      const approval = p.metadata?.approval_status
      if (statusFilter === "pending") return approval === "pending"
      if (statusFilter === "rejected") return approval === "rejected"
      if (statusFilter === "live") return p.status === "published" && approval !== "pending" && approval !== "rejected"
      if (statusFilter === "draft") return p.status !== "published" && approval !== "pending" && approval !== "rejected"
      return true
    })
  }, [products, normalizedQuery, statusFilter])

  const orderResults = useMemo(() => {
    return orders.filter((o) => {
      if (!normalizedQuery) return true
      const itemText = (o.items || [])
        .map((it) => it.title || "")
        .join(" ")
        .toLowerCase()
      return (
        o.email?.toLowerCase().includes(normalizedQuery) ||
        o.id?.toLowerCase().includes(normalizedQuery) ||
        String(o.display_id || "").toLowerCase().includes(normalizedQuery) ||
        String(o.fulfillment_status || "").toLowerCase().includes(normalizedQuery) ||
        itemText.includes(normalizedQuery)
      )
    })
  }, [orders, normalizedQuery])

  const customerResults = useMemo(() => {
    return customers.filter((c) => {
      if (!normalizedQuery) return true
      const fullName = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase().trim()
      return (
        c.email?.toLowerCase().includes(normalizedQuery) ||
        fullName.includes(normalizedQuery) ||
        c.id?.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [customers, normalizedQuery])

  const totalHits = productResults.length + orderResults.length + customerResults.length

  const saveRecent = (value: string) => {
    const clean = value.trim()
    if (clean.length < 2) return
    const next = [clean, ...recentSearches.filter((v) => v.toLowerCase() !== clean.toLowerCase())].slice(0, 6)
    setRecentSearches(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      // Ignore storage write failures.
    }
  }

  const renderProducts = activeTab === "all" || activeTab === "products"
  const renderOrders = activeTab === "all" || activeTab === "orders"
  const renderCustomers = activeTab === "all" || activeTab === "customers"

  const tabOptions: { value: SearchTab; label: string; count: number }[] = [
    { value: "all", label: "All", count: totalHits },
    { value: "products", label: "Products", count: productResults.length },
    { value: "orders", label: "Orders", count: orderResults.length },
    { value: "customers", label: "Customers", count: customerResults.length },
  ]

  const productStatusOptions = ["all", "live", "pending", "draft", "rejected"] as const

  let content

  if (loading) {
    content = <PageSkeleton label="Loading search…" stats={3} rows={6} cols={4} showAction={false} />
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
              Search
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              {products.length + orders.length + customers.length > 0
                ? `${products.length} products · ${orders.length} orders · ${customers.length} customers`
                : "Quickly find products, orders, and customers in one place"}
            </Text>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4 animate-fade-in-up-slow">
          <StatCard icon={<Tag />} label="Products" value={products.length} subtext={<Text className="text-ui-fg-subtle">In your catalog</Text>} />
          <StatCard icon={<ShoppingCart />} label="Orders" value={orders.length} subtext={<Text className="text-ui-fg-subtle">All time</Text>} />
          <StatCard icon={<Users />} label="Customers" value={customers.length} subtext={<Text className="text-ui-fg-subtle">Who bought from you</Text>} />
        </div>

        <div className="animate-fade-in-up oweg-card space-y-4 p-4 md:p-5">
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-fg-muted" />
            <input
              type="search"
              placeholder="Search product name, order ID, customer email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRecent(query)
              }}
              className="h-11 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ui-fg-muted focus:border-ui-border-strong"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {tabOptions.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-all duration-200 ${
                  activeTab === tab.value
                    ? "border-ui-border-strong bg-ui-bg-subtle text-ui-fg-base"
                    : "border-ui-border-base/70 text-ui-fg-subtle hover:border-ui-border-strong hover:text-ui-fg-base"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-ui-fg-muted">({tab.count})</span>
              </button>
            ))}
          </div>

          {(activeTab === "all" || activeTab === "products") && (
            <div className="flex flex-wrap items-center gap-2">
              <Text size="small" className="text-ui-fg-subtle">
                Product status:
              </Text>
              {productStatusOptions.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full border px-2.5 py-1 text-xs capitalize transition-all duration-200 ${
                    statusFilter === status
                      ? "border-oweg-500/40 bg-oweg-500/10 text-oweg-800 dark:text-oweg-300"
                      : "border-ui-border-base/70 text-ui-fg-subtle hover:border-ui-border-strong"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          )}

          {recentSearches.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-ui-border-base/50 pt-3">
              <Text size="small" className="text-ui-fg-subtle">
                Recent:
              </Text>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="rounded-md border border-ui-border-base/70 bg-ui-bg-subtle/50 px-2 py-1 text-xs text-ui-fg-subtle transition hover:border-ui-border-strong hover:text-ui-fg-base"
                >
                  {term}
                </button>
              ))}
            </div>
          )}
        </div>

        {totalHits === 0 ? (
          <EmptyState
            accent="oweg"
            icon={<MagnifyingGlass />}
            title="No results found"
            description="Try different keywords like SKU, email, status, or order ID."
            primaryAction={
              query
                ? {
                    label: "Clear search",
                    onClick: () => {
                      setQuery("")
                      setStatusFilter("all")
                      setActiveTab("all")
                    },
                  }
                : undefined
            }
          />
        ) : (
          <div className="animate-fade-in-up space-y-6">
            {renderProducts && productResults.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <Heading level="h2" className="text-lg">
                    Products
                  </Heading>
                  <Text size="small" className="text-ui-fg-muted">
                    {productResults.length} result{productResults.length !== 1 ? "s" : ""}
                  </Text>
                </div>
                <div className="overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base">
                  <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_120px_100px_80px] md:gap-4 border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
                    {["Product", "Status", "Created", ""].map((h) => (
                      <Text key={h || "action"} size="small" weight="plus" className="text-ui-fg-subtle">
                        {h}
                      </Text>
                    ))}
                  </div>
                  <div className="divide-y divide-ui-border-base/70">
                    {productResults.slice(0, 50).map((p) => {
                      const status = getProductStatus(p)
                      const img = p.thumbnail || p.images?.[0]?.url
                      return (
                        <div
                          key={p.id}
                          className="grid grid-cols-1 gap-2 px-4 py-4 transition-colors hover:bg-ui-bg-subtle/60 md:grid-cols-[minmax(0,1fr)_120px_100px_80px] md:items-center md:gap-4"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={img}
                                alt={p.title}
                                className="h-10 w-10 shrink-0 rounded-lg border border-ui-border-base/70 object-cover"
                                onError={(e) => {
                                  ;(e.currentTarget as HTMLImageElement).style.display = "none"
                                }}
                              />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ui-border-base/70 bg-ui-bg-subtle text-xs text-ui-fg-muted">
                                —
                              </div>
                            )}
                            <div className="min-w-0">
                              <Text weight="plus" className="truncate">
                                {p.title}
                              </Text>
                              <Text size="small" className="truncate text-ui-fg-subtle">
                                {p.handle || p.id}
                              </Text>
                            </div>
                          </div>
                          <ProductStatus status={status} />
                          <Text size="small" className="text-ui-fg-subtle">
                            {formatDate(p.created_at)}
                          </Text>
                          <div className="md:text-right">
                            <Button variant="transparent" size="small" onClick={() => router.push(`/products/${p.id}`)}>
                              Open
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}

            {renderOrders && orderResults.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <Heading level="h2" className="text-lg">
                    Orders
                  </Heading>
                  <Text size="small" className="text-ui-fg-muted">
                    {orderResults.length} result{orderResults.length !== 1 ? "s" : ""}
                  </Text>
                </div>
                <div className="overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base">
                  <div className="hidden md:grid md:grid-cols-[100px_minmax(0,1fr)_120px_100px] md:gap-4 border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
                    {["Order", "Customer", "Status", "Total"].map((h) => (
                      <Text
                        key={h}
                        size="small"
                        weight="plus"
                        className={`text-ui-fg-subtle ${h === "Total" ? "text-right" : ""}`}
                      >
                        {h}
                      </Text>
                    ))}
                  </div>
                  <div className="divide-y divide-ui-border-base/70">
                    {orderResults.slice(0, 50).map((o) => {
                      const status = o.fulfillment_status || "pending"
                      return (
                        <div
                          key={o.id}
                          className="grid grid-cols-1 gap-2 px-4 py-4 transition-colors hover:bg-ui-bg-subtle/60 md:grid-cols-[100px_minmax(0,1fr)_120px_100px] md:items-center md:gap-4"
                        >
                          <div>
                            <Text weight="plus">#{o.display_id || o.id.slice(0, 8)}</Text>
                            <Text size="small" className="text-ui-fg-subtle md:hidden">
                              {formatDate(o.created_at)}
                            </Text>
                          </div>
                          <Text size="small" className="truncate">
                            {o.email || "N/A"}
                          </Text>
                          <span className="inline-flex items-center gap-1.5 capitalize">
                            <StatusDot variant={fulfillmentStatusVariant(status)} />
                            <Text size="small">{status}</Text>
                          </span>
                          <Text weight="plus" className="md:text-right">
                            {formatCurrency(o.total || 0)}
                          </Text>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}

            {renderCustomers && customerResults.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <Heading level="h2" className="text-lg">
                    Customers
                  </Heading>
                  <Text size="small" className="text-ui-fg-muted">
                    {customerResults.length} result{customerResults.length !== 1 ? "s" : ""}
                  </Text>
                </div>
                <div className="overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base">
                  <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_120px] md:gap-4 border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
                    {["Name", "Email", "Orders", "Total spent"].map((h) => (
                      <Text
                        key={h}
                        size="small"
                        weight="plus"
                        className={`text-ui-fg-subtle ${h === "Total spent" ? "text-right" : ""}`}
                      >
                        {h}
                      </Text>
                    ))}
                  </div>
                  <div className="divide-y divide-ui-border-base/70">
                    {customerResults.slice(0, 50).map((c) => (
                      <div
                        key={c.id}
                        className="grid grid-cols-1 gap-2 px-4 py-4 transition-colors hover:bg-ui-bg-subtle/60 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_120px] md:items-center md:gap-4"
                      >
                        <Text weight="plus">
                          {`${c.first_name || ""} ${c.last_name || ""}`.trim() || "Guest"}
                        </Text>
                        <Text size="small" className="truncate text-ui-fg-subtle">
                          {c.email || "N/A"}
                        </Text>
                        <span className="inline-flex w-fit items-center rounded-full bg-oweg-500/10 px-2 py-0.5 text-xs font-medium text-oweg-800 dark:text-oweg-300">
                          {c.orders_count || 0} orders
                        </span>
                        <Text weight="plus" className="md:text-right">
                          {formatCurrency(c.total_spent || 0)}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}
