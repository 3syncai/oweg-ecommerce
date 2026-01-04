"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Badge, Table } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import { vendorOrdersApi } from "@/lib/api/client"
import { useRouter } from "next/navigation"

type Order = {
  id: string
  display_id?: string
  email?: string
  status: string
  fulfillment_status?: string
  total: any
  created_at: string
  items?: Array<{
    id: string
    title: string
    quantity: number
  }>
}

const VendorOrdersPage = () => {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")

    if (!vendorToken) {
      router.push("/login")
      return
    }

    const loadOrders = async () => {
      try {
        const data = await vendorOrdersApi.list()
        setOrders(data?.orders || [])
      } catch (e: any) {
        if (e.status === 403) {
          router.push("/pending")
          return
        }
        setError(e?.message || "Failed to load orders")
        console.error("Orders error:", e)
      } finally {
        setLoading(false)
      }
    }

    loadOrders()
  }, [router])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount) // Don't divide - already in rupees
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  let content

  if (loading) {
    content = (
      <Container className="p-6">
        <Text>Loading orders...</Text>
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
            <Heading level="h1">Orders</Heading>
            <Text className="text-ui-fg-subtle">Manage your orders</Text>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="p-8 text-center border border-ui-border-base rounded-lg">
            <Text className="text-ui-fg-subtle">No orders found</Text>
          </div>
        ) : (
          <div className="border border-ui-border-base rounded-lg overflow-hidden">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Order</Table.HeaderCell>
                  <Table.HeaderCell>Customer</Table.HeaderCell>
                  <Table.HeaderCell>Date</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Total</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {orders.map((order) => {
                  const orderTotal =
                    typeof order.total === "number" ? order.total : order.total?.amount || 0

                  return (
                    <Table.Row key={order.id}>
                      <Table.Cell>
                        <Text className="font-medium">#{order.display_id || order.id.slice(0, 8)}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text>{order.email || "N/A"}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text className="text-ui-fg-subtle">{formatDate(order.created_at)}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge
                          color={
                            order.fulfillment_status === 'delivered' ? 'green' :
                              order.fulfillment_status === 'shipped' ? 'blue' :
                                order.fulfillment_status === 'canceled' ? 'red' : 'orange'
                          }
                        >
                          {order.fulfillment_status || 'pending'}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <Text className="font-medium">{formatCurrency(orderTotal)}</Text>
                      </Table.Cell>
                    </Table.Row>
                  )
                })}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorOrdersPage

