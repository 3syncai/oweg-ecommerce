"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Badge, Button, Table } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import { vendorProductsApi, vendorOrdersApi, vendorCustomersApi, vendorInventoryApi } from "@/lib/api/client"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ShoppingCart,
  CurrencyDollar,
  Users,
  ArchiveBox,
  Plus,
  ArrowUpRightMini,
  Clock
} from "@medusajs/icons"

type DashboardData = {
  // Metrics
  totalProducts: number
  publishedProducts: number
  draftProducts: number
  pendingApprovalProducts: number
  totalOrders: number
  pendingOrders: number
  completedOrders: number
  totalRevenue: number
  totalCustomers: number
  averageOrderValue: number

  // Lists
  recentOrders: any[]
  lowStockProducts: any[]
  topProducts: { product: string; orders: number }[]
  actionItems: { type: string; message: string; link: string }[]
}

const VendorDashboardPage = () => {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")

    if (!vendorToken) {
      router.push("/login")
      return
    }

    const loadDashboardData = async () => {
      try {
        setLoading(true)

        // Fetch all data in parallel
        const [productsData, ordersData, customersData, inventoryData] = await Promise.all([
          vendorProductsApi.list().catch(() => ({ products: [] })),
          vendorOrdersApi.list().catch(() => ({ orders: [] })),
          vendorCustomersApi.list().catch(() => ({ customers: [] })),
          vendorInventoryApi.list().catch(() => ({ inventory: [] }))
        ])

        const products = productsData?.products || []
        const orders = ordersData?.orders || []
        const customers = customersData?.customers || []
        const inventory = inventoryData?.inventory || []

        // Product stats
        const publishedProducts = products.filter((p: any) =>
          p.status === 'published' &&
          p.metadata?.approval_status !== 'pending' &&
          p.metadata?.approval_status !== 'rejected'
        ).length

        const pendingApprovalProducts = products.filter((p: any) =>
          p.metadata?.approval_status === 'pending'
        ).length

        const draftProducts = products.filter((p: any) =>
          p.status === 'draft'
        ).length

        // Order stats - use fulfillment_status
        const pendingOrders = orders.filter((o: any) =>
          o.fulfillment_status === 'pending' || o.fulfillment_status === 'processing'
        ).length
        const completedOrders = orders.filter((o: any) =>
          o.fulfillment_status === 'shipped' || o.fulfillment_status === 'delivered'
        ).length

        const totalRevenue = orders.reduce((sum: number, order: any) => {
          return sum + (order.total || 0)
        }, 0)

        const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0

        // Recent orders
        const recentOrders = orders
          .sort((a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          .slice(0, 5)

        // Low stock items (< 10 units)
        const lowStockProducts = inventory
          .filter((item: any) => {
            const qty = item.available_quantity || item.stocked_quantity || 0
            return qty > 0 && qty < 10
          })
          .slice(0, 5)

        // Top products by order count
        const productOrderCount = new Map<string, number>()
        orders.forEach((order: any) => {
          (order.items || []).forEach((item: any) => {
            const title = item.title || 'Unknown Product'
            productOrderCount.set(title, (productOrderCount.get(title) || 0) + 1)
          })
        })

        const topProducts = Array.from(productOrderCount.entries())
          .map(([product, orders]) => ({ product, orders }))
          .sort((a, b) => b.orders - a.orders)
          .slice(0, 5)

        // Action items
        const actionItems: any[] = []

        if (pendingApprovalProducts > 0) {
          actionItems.push({
            type: 'warning',
            message: `${pendingApprovalProducts} product${pendingApprovalProducts > 1 ? 's' : ''} awaiting approval`,
            link: '/products'
          })
        }

        if (pendingOrders > 0) {
          actionItems.push({
            type: 'info',
            message: `${pendingOrders} pending order${pendingOrders > 1 ? 's' : ''} to process`,
            link: '/orders'
          })
        }

        if (lowStockProducts.length > 0) {
          actionItems.push({
            type: 'warning',
            message: `${lowStockProducts.length} product${lowStockProducts.length > 1 ? 's' : ''} running low on stock`,
            link: '/inventory'
          })
        }

        setData({
          totalProducts: products.length,
          publishedProducts,
          draftProducts,
          pendingApprovalProducts,
          totalOrders: orders.length,
          pendingOrders,
          completedOrders,
          totalRevenue,
          totalCustomers: customers.length,
          averageOrderValue: avgOrderValue,
          recentOrders,
          lowStockProducts,
          topProducts,
          actionItems
        })

      } catch (e: any) {
        if (e.status === 403) {
          router.push("/pending")
          return
        }
        setError(e?.message || "Failed to load dashboard")
        console.error("Dashboard error:", e)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [router])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    })
  }

  let content

  if (loading) {
    content = (
      <Container className="p-6">
        <Text>Loading dashboard...</Text>
      </Container>
    )
  } else if (error) {
    content = (
      <Container className="p-6">
        <Text className="text-ui-fg-error">{error}</Text>
      </Container>
    )
  } else if (data) {
    content = (
      <Container className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Heading level="h1">Dashboard</Heading>
            <Text className="text-ui-fg-subtle">Welcome back! Here's what's happening</Text>
          </div>
          <Button
            variant="primary"
            onClick={() => router.push("/products/new")}
          >
            <Plus />
            Create Product
          </Button>
        </div>

        {/* Action Items Alert */}
        {data.actionItems.length > 0 && (
          <div className="border border-ui-border-base bg-ui-bg-base rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
              <Heading level="h3" className="text-ui-fg-base">Action Required</Heading>
            </div>
            <div className="space-y-2 pl-5">
              {data.actionItems.map((item, idx) => (
                <Link
                  key={idx}
                  href={item.link}
                  className="flex items-center justify-between p-3 bg-ui-bg-subtle/50 rounded-md hover:bg-ui-bg-subtle transition-colors group"
                >
                  <Text>{item.message}</Text>
                  <ArrowUpRightMini className="text-ui-fg-muted group-hover:text-ui-fg-base" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Active Products Info Card */}
        {data.publishedProducts > 0 && (
          <div className="border border-ui-border-base bg-ui-bg-base rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                <div>
                  <Heading level="h3" className="text-ui-fg-base">
                    {data.publishedProducts} Active Product{data.publishedProducts > 1 ? 's' : ''}
                  </Heading>
                  <Text className="text-ui-fg-subtle text-sm">
                    Your approved products are live and visible to customers
                  </Text>
                </div>
              </div>
              <Button
                variant="transparent"
                onClick={() => router.push("/products")}
                className="text-ui-fg-subtle hover:text-ui-fg-base"
              >
                View Products
                <ArrowUpRightMini />
              </Button>
            </div>
          </div>
        )}

        {/* Primary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-md bg-ui-bg-base-hover">
                <CurrencyDollar className="text-ui-fg-muted" />
              </div>
              <Text className="text-ui-fg-subtle text-sm">Total Revenue</Text>
            </div>
            <Heading level="h2" className="text-2xl">
              {formatCurrency(data.totalRevenue)}
            </Heading>
            {data.totalOrders > 0 && (
              <Text className="text-ui-fg-subtle text-xs mt-2">
                Avg: {formatCurrency(data.averageOrderValue)} per order
              </Text>
            )}
          </div>

          <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-md bg-ui-bg-base-hover">
                <ShoppingCart className="text-ui-fg-muted" />
              </div>
              <Text className="text-ui-fg-subtle text-sm">Orders</Text>
            </div>
            <Heading level="h2" className="text-2xl">
              {data.totalOrders}
            </Heading>
            <div className="mt-2 flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
                <Text className="text-ui-fg-subtle text-sm">{data.pendingOrders} Pending</Text>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                <Text className="text-ui-fg-subtle text-sm">{data.completedOrders} Done</Text>
              </div>
            </div>
          </div>

          <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-md bg-ui-bg-base-hover">
                <Users className="text-ui-fg-muted" />
              </div>
              <Text className="text-ui-fg-subtle text-sm">Customers</Text>
            </div>
            <Heading level="h2" className="text-2xl">
              {data.totalCustomers}
            </Heading>
            <Text className="text-ui-fg-subtle text-xs mt-2">
              Unique buyers
            </Text>
          </div>

          <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-md bg-ui-bg-base-hover">
                <ArchiveBox className="text-ui-fg-muted" />
              </div>
              <Text className="text-ui-fg-subtle text-sm">Products</Text>
            </div>
            <Heading level="h2" className="text-2xl">
              {data.totalProducts}
            </Heading>
            <div className="mt-2 flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                <Text className="text-ui-fg-subtle text-sm">{data.publishedProducts} Live</Text>
              </div>
              {data.pendingApprovalProducts > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
                  <Text className="text-ui-fg-subtle text-sm">{data.pendingApprovalProducts} Pending</Text>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Orders */}
          {data.recentOrders.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <Heading level="h3">Recent Orders</Heading>
                <Button
                  variant="transparent"
                  onClick={() => router.push("/orders")}
                >
                  View All
                  <ArrowUpRightMini />
                </Button>
              </div>
              <div className="border border-ui-border-base rounded-lg divide-y divide-ui-border-base">
                {data.recentOrders.map((order: any) => {
                  const statusColor = order.fulfillment_status === 'delivered' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' :
                    order.fulfillment_status === 'shipped' ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]' :
                      order.fulfillment_status === 'canceled' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' :
                        'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]';

                  return (
                    <div key={order.id} className="p-4 flex items-center justify-between hover:bg-ui-bg-subtle transition-colors">
                      <div className="flex-1">
                        <Text className="font-medium">#{order.display_id || order.id.slice(0, 8)}</Text>
                        <Text className="text-ui-fg-subtle text-sm">{order.email}</Text>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                          <Text className="text-ui-fg-subtle text-sm capitalize">{order.fulfillment_status || 'pending'}</Text>
                        </div>
                        <Text className="font-medium min-w-[80px] text-right">
                          {formatCurrency(order.total || 0)}
                        </Text>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Top Products */}
          {data.topProducts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <Heading level="h3">Top Selling Products</Heading>
              </div>
              <div className="border border-ui-border-base rounded-lg divide-y divide-ui-border-base">
                {data.topProducts.map((item, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-ui-bg-base-hover">
                        <Text className="text-sm font-medium">{idx + 1}</Text>
                      </div>
                      <Text className="font-medium">{item.product}</Text>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
                      <Text className="text-ui-fg-subtle text-sm">{item.orders} orders</Text>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Low Stock Alert */}
          {data.lowStockProducts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <Heading level="h3">Low Stock Alert</Heading>
                <Button
                  variant="transparent"
                  onClick={() => router.push("/inventory")}
                >
                  Manage
                  <ArrowUpRightMini />
                </Button>
              </div>
              <div className="border border-orange-500/20 bg-orange-500/5 rounded-lg divide-y divide-orange-500/10">
                {data.lowStockProducts.map((item: any, idx: number) => (
                  <div key={idx} className="p-4 flex items-center justify-between">
                    <div>
                      <Text className="font-medium">{item.product_title}</Text>
                      <Text className="text-ui-fg-subtle text-sm">{item.variant_title}</Text>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
                      <Text className="text-ui-fg-subtle text-sm">
                        {item.available_quantity || item.stocked_quantity} left
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div>
            <Heading level="h3" className="mb-4">Quick Actions</Heading>
            <div className="grid grid-cols-1 gap-3">
              <Link
                href="/products"
                className="p-4 border border-ui-border-base rounded-lg hover:bg-ui-bg-subtle transition-colors flex items-center justify-between group"
              >
                <div>
                  <Text className="font-medium">Manage Products</Text>
                  <Text className="text-ui-fg-subtle text-sm">View and edit your catalog</Text>
                </div>
                <ArrowUpRightMini className="text-ui-fg-muted group-hover:text-ui-fg-base" />
              </Link>
              <Link
                href="/orders"
                className="p-4 border border-ui-border-base rounded-lg hover:bg-ui-bg-subtle transition-colors flex items-center justify-between group"
              >
                <div>
                  <Text className="font-medium">View Orders</Text>
                  <Text className="text-ui-fg-subtle text-sm">Process customer orders</Text>
                </div>
                <ArrowUpRightMini className="text-ui-fg-muted group-hover:text-ui-fg-base" />
              </Link>
              <Link
                href="/customers"
                className="p-4 border border-ui-border-base rounded-lg hover:bg-ui-bg-subtle transition-colors flex items-center justify-between group"
              >
                <div>
                  <Text className="font-medium">View Customers</Text>
                  <Text className="text-ui-fg-subtle text-sm">See who's buying from you</Text>
                </div>
                <ArrowUpRightMini className="text-ui-fg-muted group-hover:text-ui-fg-base" />
              </Link>
              <Link
                href="/inventory"
                className="p-4 border border-ui-border-base rounded-lg hover:bg-ui-bg-subtle transition-colors flex items-center justify-between group"
              >
                <div>
                  <Text className="font-medium">Manage Inventory</Text>
                  <Text className="text-ui-fg-subtle text-sm">Update stock levels</Text>
                </div>
                <ArrowUpRightMini className="text-ui-fg-muted group-hover:text-ui-fg-base" />
              </Link>
            </div>
          </div>
        </div>
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorDashboardPage
