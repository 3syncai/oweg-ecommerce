"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Badge } from "@medusajs/ui"
import VendorShell from "../../../components/VendorShell"
// Icons removed - using text labels instead

type Stats = {
  total_products: number
  total_orders: number
  total_revenue: number
  products_by_status: {
    draft: number
    published: number
  }
  recent_orders: Array<{
    id: string
    display_id: string
    email: string
    total: any
    status: string
    created_at: string
  }>
}

const VendorDashboardPage = () => {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    
    if (!vendorToken) {
      window.location.href = "/app/login"
      return
    }

    const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")

    const loadStats = async () => {
      try {
        const res = await fetch(`${backend}/vendor/stats`, {
          headers: { Authorization: `Bearer ${vendorToken}` },
        })

        if (res.status === 403) {
          window.location.href = "/vendor/pending"
          return
        }

        if (!res.ok) {
          throw new Error(`Failed to load stats: ${res.status}`)
        }

        const data = await res.json()
        setStats(data?.stats || null)
      } catch (e: any) {
        setError(e?.message || "Failed to load dashboard")
        console.error("Dashboard error:", e)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount / 100) // Assuming amount is in smallest currency unit
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
  } else {
    content = (
    <Container className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h1">Dashboard</Heading>
          <Text className="text-ui-fg-subtle">Overview of your vendor account</Text>
        </div>
      </div>

      {stats && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
              <Text className="text-ui-fg-subtle text-sm mb-2">Total Products</Text>
              <Heading level="h2" className="text-2xl">
                {stats.total_products}
              </Heading>
              <div className="mt-2 flex gap-2">
                <Badge color="blue">{stats.products_by_status.published} Published</Badge>
                <Badge color="grey">{stats.products_by_status.draft} Draft</Badge>
              </div>
            </div>

            <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
              <Text className="text-ui-fg-subtle text-sm mb-2">Total Orders</Text>
              <Heading level="h2" className="text-2xl">
                {stats.total_orders}
              </Heading>
            </div>

            <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
              <Text className="text-ui-fg-subtle text-sm mb-2">Total Revenue</Text>
              <Heading level="h2" className="text-2xl">
                {formatCurrency(stats.total_revenue)}
              </Heading>
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a
              href="/app/vendor/products"
              className="p-6 border border-ui-border-base rounded-lg hover:bg-ui-bg-subtle transition-colors block"
            >
              <Heading level="h3" className="mb-2">Products</Heading>
              <Text className="text-ui-fg-subtle text-sm">Manage your products</Text>
            </a>
            <a
              href="/app/vendor/orders"
              className="p-6 border border-ui-border-base rounded-lg hover:bg-ui-bg-subtle transition-colors block"
            >
              <Heading level="h3" className="mb-2">Orders</Heading>
              <Text className="text-ui-fg-subtle text-sm">View your orders</Text>
            </a>
            <a
              href="/app/vendor/profile"
              className="p-6 border border-ui-border-base rounded-lg hover:bg-ui-bg-subtle transition-colors block"
            >
              <Heading level="h3" className="mb-2">Profile</Heading>
              <Text className="text-ui-fg-subtle text-sm">Update your profile</Text>
            </a>
          </div>

          {/* Recent Orders */}
          {stats.recent_orders.length > 0 && (
            <div className="border border-ui-border-base rounded-lg">
              <div className="p-4 border-b border-ui-border-base">
                <Heading level="h3">Recent Orders</Heading>
              </div>
              <div className="divide-y divide-ui-border-base">
                {stats.recent_orders.map((order) => (
                  <div key={order.id} className="p-4 flex items-center justify-between">
                    <div>
                      <Text className="font-medium">#{order.display_id}</Text>
                      <Text className="text-ui-fg-subtle text-sm">{order.email}</Text>
                    </div>
                    <div className="text-right">
                      <Text className="font-medium">
                        {formatCurrency(
                            typeof order.total === "number" ? order.total : order.total?.amount || 0
                        )}
                      </Text>
                      <Badge color="blue" className="mt-1">{order.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Container>
  )
  }

  return <VendorShell>{content}</VendorShell>
}

// Explicitly no config export to prevent sidebar registration
// Route is still accessible at /app/vendor/dashboard
// export const config = defineRouteConfig({
//   label: "Dashboard",
// })

export default VendorDashboardPage

