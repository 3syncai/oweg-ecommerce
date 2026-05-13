"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Table,
  Text,
} from "@medusajs/ui"
import { MagnifyingGlass } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import {
  vendorCustomersApi,
  vendorOrdersApi,
  vendorProductsApi,
} from "@/lib/api/client"

type SearchTab = "all" | "products" | "orders" | "customers"

// Small colored dot used for status / result indicators (matches dashboard style)
const STATUS_DOT: Record<string, string> = {
  live: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]",
  pending: "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]",
  draft: "bg-gray-400",
  rejected: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]",
  shipped: "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]",
  delivered: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]",
  canceled: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]",
  default: "bg-gray-400",
}

const StatusDot = ({ status }: { status: string }) => {
  const key = (status || "default").toLowerCase()
  const cls = STATUS_DOT[key] || STATUS_DOT.default
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${cls}`} />
      <span className="text-ui-fg-base capitalize text-sm">{status}</span>
    </div>
  )
}

const ResultDot = ({ count }: { count: number }) => {
  const cls = count > 0
    ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]"
    : "bg-gray-400"
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${cls}`} />
      <span className="text-ui-fg-subtle text-sm">{count} results</span>
    </div>
  )
}

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

  return (
    <VendorShell>
      <Container className="p-4 md:p-6 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Heading level="h1">Search</Heading>
            <Text className="text-ui-fg-subtle">
              Quickly find products, orders, and customers in one place.
            </Text>
          </div>
          <div className="flex items-center gap-4 text-sm text-ui-fg-subtle">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
              <span>{products.length} products</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
              <span>{orders.length} orders</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
              <span>{customers.length} customers</span>
            </div>
          </div>
        </div>

        <div className="border border-ui-border-base rounded-lg p-4 space-y-4">
          <div className="relative">
            <Input
              placeholder="Search product name, order ID, customer email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRecent(query)
              }}
              className="pl-9"
            />
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-ui-fg-muted">
              <MagnifyingGlass />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "products", "orders", "customers"] as SearchTab[]).map((tab) => (
              <Button
                key={tab}
                variant={activeTab === tab ? "primary" : "secondary"}
                size="small"
                onClick={() => setActiveTab(tab)}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </Button>
            ))}
          </div>

          {(activeTab === "all" || activeTab === "products") && (
            <div className="flex items-center gap-2 flex-wrap">
              <Text size="small" className="text-ui-fg-subtle">
                Product status:
              </Text>
              {(["all", "live", "pending", "draft", "rejected"] as const).map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? "primary" : "transparent"}
                  size="small"
                  onClick={() => setStatusFilter(status)}
                >
                  {status[0].toUpperCase() + status.slice(1)}
                </Button>
              ))}
            </div>
          )}

          {recentSearches.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Text size="small" className="text-ui-fg-subtle">
                Recent:
              </Text>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="text-xs px-2 py-1 rounded-md border border-ui-border-base hover:bg-ui-bg-base-hover"
                >
                  {term}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <Text>Loading searchable data...</Text>
        ) : error ? (
          <Text className="text-ui-fg-error">{error}</Text>
        ) : totalHits === 0 ? (
          <div className="p-8 text-center border border-ui-border-base rounded-lg border-dashed">
            <Text className="text-ui-fg-subtle">
              No results found. Try different keywords like SKU, email, status, or order id.
            </Text>
          </div>
        ) : (
          <div className="space-y-6">
            {renderProducts && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <Heading level="h2">Products</Heading>
                  <ResultDot count={productResults.length} />
                </div>
                <div className="border border-ui-border-base rounded-lg overflow-x-auto">
                  <Table className="min-w-[680px]">
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Product</Table.HeaderCell>
                        <Table.HeaderCell>Status</Table.HeaderCell>
                        <Table.HeaderCell>Created</Table.HeaderCell>
                        <Table.HeaderCell className="text-right">Action</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {productResults.slice(0, 50).map((p) => {
                        const status =
                          p.metadata?.approval_status === "pending"
                            ? "pending"
                            : p.metadata?.approval_status === "rejected"
                              ? "rejected"
                              : p.status === "published"
                                ? "live"
                                : "draft"
                        return (
                          <Table.Row key={p.id}>
                            <Table.Cell>
                              <div className="flex items-center gap-3">
                                {(() => {
                                  const img = p.thumbnail || p.images?.[0]?.url
                                  return img ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={img}
                                      alt={p.title}
                                      className="w-10 h-10 object-cover rounded border border-ui-border-base flex-shrink-0"
                                      onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).style.display = "none"
                                      }}
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded border border-ui-border-base bg-ui-bg-subtle flex items-center justify-center text-ui-fg-muted text-xs flex-shrink-0">
                                      —
                                    </div>
                                  )
                                })()}
                                <div className="flex flex-col min-w-0">
                                  <Text className="font-medium truncate">{p.title}</Text>
                                  <Text className="text-ui-fg-subtle text-xs truncate">{p.handle || p.id}</Text>
                                </div>
                              </div>
                            </Table.Cell>
                            <Table.Cell>
                              <StatusDot status={status} />
                            </Table.Cell>
                            <Table.Cell>
                              <Text className="text-ui-fg-subtle text-sm">
                                {p.created_at ? new Date(p.created_at).toLocaleDateString("en-IN") : "—"}
                              </Text>
                            </Table.Cell>
                            <Table.Cell className="text-right">
                              <Button variant="transparent" size="small" onClick={() => router.push(`/products/${p.id}`)}>
                                Open
                              </Button>
                            </Table.Cell>
                          </Table.Row>
                        )
                      })}
                    </Table.Body>
                  </Table>
                </div>
              </section>
            )}

            {renderOrders && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <Heading level="h2">Orders</Heading>
                  <ResultDot count={orderResults.length} />
                </div>
                <div className="border border-ui-border-base rounded-lg overflow-x-auto">
                  <Table className="min-w-[680px]">
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Order</Table.HeaderCell>
                        <Table.HeaderCell>Customer</Table.HeaderCell>
                        <Table.HeaderCell>Status</Table.HeaderCell>
                        <Table.HeaderCell className="text-right">Total</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {orderResults.slice(0, 50).map((o) => (
                        <Table.Row key={o.id}>
                          <Table.Cell>
                            <div className="flex flex-col">
                              <Text className="font-medium">#{o.display_id || o.id.slice(0, 8)}</Text>
                              <Text className="text-ui-fg-subtle text-xs">
                                {o.created_at ? new Date(o.created_at).toLocaleDateString("en-IN") : "—"}
                              </Text>
                            </div>
                          </Table.Cell>
                          <Table.Cell>
                            <Text>{o.email || "N/A"}</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <StatusDot status={o.fulfillment_status || "pending"} />
                          </Table.Cell>
                          <Table.Cell className="text-right">
                            <Text className="font-medium">
                              {new Intl.NumberFormat("en-IN", {
                                style: "currency",
                                currency: "INR",
                              }).format(o.total || 0)}
                            </Text>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
              </section>
            )}

            {renderCustomers && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <Heading level="h2">Customers</Heading>
                  <ResultDot count={customerResults.length} />
                </div>
                <div className="border border-ui-border-base rounded-lg overflow-x-auto">
                  <Table className="min-w-[680px]">
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Name</Table.HeaderCell>
                        <Table.HeaderCell>Email</Table.HeaderCell>
                        <Table.HeaderCell>Orders</Table.HeaderCell>
                        <Table.HeaderCell className="text-right">Total Spent</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {customerResults.slice(0, 50).map((c) => (
                        <Table.Row key={c.id}>
                          <Table.Cell>
                            <Text className="font-medium">
                              {`${c.first_name || ""} ${c.last_name || ""}`.trim() || "Guest"}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Text>{c.email || "N/A"}</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
                              <Text className="text-ui-fg-subtle text-sm">
                                {c.orders_count || 0} orders
                              </Text>
                            </div>
                          </Table.Cell>
                          <Table.Cell className="text-right">
                            <Text className="font-medium">
                              {new Intl.NumberFormat("en-IN", {
                                style: "currency",
                                currency: "INR",
                              }).format(c.total_spent || 0)}
                            </Text>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
              </section>
            )}
          </div>
        )}
      </Container>
    </VendorShell>
  )
}
