import { defineRouteConfig } from "@medusajs/admin-sdk"
import { UserGroup } from "@medusajs/icons"
import { Container, Heading, Table, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

type CustomerRow = {
  customer_key: string
  name: string
  email: string | null
  orders_count: number
  customer_reliability: {
    rating: number | null
    label: string
    eligible_orders: number
    returns_count: number
    replacements_count: number
  }
}

const CustomerInsightsPage = () => {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch("/admin/customer-reliability", { credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load customer ratings")))
      .then((data) => setCustomers(data.customers || []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false))
  }, [])
  return <Container className="divide-y p-0">
    <div className="flex items-start justify-between p-6">
      <div>
        <Heading level="h1">Customer ratings</Heading>
        <Text className="mt-1 text-ui-fg-subtle">Live customer behaviour score based on completed returns and replacements.</Text>
      </div>
      <Text size="small" className="text-ui-fg-muted">5 = lowest completed return rate</Text>
    </div>
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Customer</Table.HeaderCell>
          <Table.HeaderCell>Orders</Table.HeaderCell>
          <Table.HeaderCell>Rating</Table.HeaderCell>
          <Table.HeaderCell>Returns</Table.HeaderCell>
          <Table.HeaderCell>Replacements</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {customers.map((customer) => {
          const rating = customer.customer_reliability
          return <Table.Row key={customer.customer_key}>
            <Table.Cell><div className="font-medium">{customer.name}</div><div className="text-ui-fg-muted text-sm">{customer.email || "No email"}</div></Table.Cell>
            <Table.Cell>{customer.orders_count}</Table.Cell>
            <Table.Cell>{rating.rating == null ? <span className="text-ui-fg-muted">New customer</span> : <span className="font-medium text-amber-700">★ {rating.rating.toFixed(1)} / 5 · {rating.label}</span>}</Table.Cell>
            <Table.Cell>{rating.returns_count}</Table.Cell>
            <Table.Cell>{rating.replacements_count}</Table.Cell>
          </Table.Row>
        })}
        {!loading && customers.length === 0 ? <Table.Row>
          <Table.Cell>No customer history yet.</Table.Cell>
          <Table.Cell />
          <Table.Cell />
          <Table.Cell />
          <Table.Cell />
        </Table.Row> : null}
      </Table.Body>
    </Table>
  </Container>
}

export const config = defineRouteConfig({ label: "Customer ratings", icon: UserGroup })
export default CustomerInsightsPage
