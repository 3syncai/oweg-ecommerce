"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Badge } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import { vendorStatsApi } from "@/lib/api/client"
import { useRouter } from "next/navigation"

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

const VendorAnalyticsPage = () => {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    
    if (!vendorToken) {
      router.push("/login")
      return
    }

    const loadStats = async () => {
      try {
        const data = await vendorStatsApi.get()

        if (data?.stats) {
          setStats(data.stats)
        }
      } catch (e: any) {
        if (e.status === 403) {
          router.push("/pending")
          return
        }
        setError(e?.message || "Failed to load analytics")
        console.error("Analytics error:", e)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [router])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount / 100)
  }

  let content

  if (loading) {
    content = (
      <Container className="p-6">
        <Text>Loading analytics...</Text>
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
      <div>
        <Heading level="h1">Analytics</Heading>
        <Text className="text-ui-fg-subtle">View your sales and performance metrics</Text>
      </div>

      {stats && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
              <Text className="text-ui-fg-subtle text-sm mb-2">Total Revenue</Text>
              <Heading level="h2" className="text-2xl">
                {formatCurrency(stats.total_revenue)}
              </Heading>
            </div>

            <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
              <Text className="text-ui-fg-subtle text-sm mb-2">Total Orders</Text>
              <Heading level="h2" className="text-2xl">
                {stats.total_orders}
              </Heading>
              {stats.total_orders > 0 && (
                <Text className="text-ui-fg-subtle text-sm mt-2">
                  Average: {formatCurrency(stats.total_revenue / stats.total_orders)}
                </Text>
              )}
            </div>

            <div className="p-6 border border-ui-border-base rounded-lg bg-ui-bg-base">
              <Text className="text-ui-fg-subtle text-sm mb-2">Total Products</Text>
              <Heading level="h2" className="text-2xl">
                {stats.total_products}
              </Heading>
              <div className="mt-2 flex gap-2">
                <Badge color="green">{stats.products_by_status.published} Published</Badge>
                <Badge color="grey">{stats.products_by_status.draft} Draft</Badge>
              </div>
            </div>
          </div>

          {/* Product Status Breakdown */}
          <div className="border border-ui-border-base rounded-lg p-6">
            <Heading level="h3" className="mb-4">Product Status</Heading>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Text>Published Products</Text>
                <Badge color="green">{stats.products_by_status.published}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <Text>Draft Products</Text>
                <Badge color="grey">{stats.products_by_status.draft}</Badge>
              </div>
            </div>
          </div>

          {/* Recent Orders Summary */}
          {stats.recent_orders.length > 0 && (
            <div className="border border-ui-border-base rounded-lg">
              <div className="p-4 border-b border-ui-border-base">
                <Heading level="h3">Recent Orders Summary</Heading>
              </div>
              <div className="p-4">
                <Text className="text-ui-fg-subtle">
                  Last {stats.recent_orders.length} orders processed
                </Text>
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

export default VendorAnalyticsPage

