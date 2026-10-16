import { useEffect, useState, type ComponentType } from "react"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { currentAdminAccess } from "../lib/admin-access-client"
import { canAccessAdminPage } from "../../shared/admin-access"
import { canAccessAdminApi } from "../../lib/admin-access/policy"

type OrderSummary = {
  id: string
  display_id: number
  created_at: string
  status: string
  currency_code: string | null
  total: number | null
  payment_status: string
  fulfillment_status: string
}
type Customer = { id: string }

/** Native order tools remain available only when the account has order access. */
export function CustomerOrderOverview({
  customer,
  FullSection,
}: {
  customer: Customer
  FullSection: ComponentType<any>
}) {
  const [mode, setMode] = useState<"loading" | "full" | "summary" | "error">(
    "loading"
  )
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setMode("loading")
    currentAdminAccess()
      .then((access) => {
        if (!cancelled)
          setMode(
            canAccessAdminPage(access, "/orders") &&
              canAccessAdminApi(access, "POST", "/admin/orders")
              ? "full"
              : "summary"
          )
      })
      .catch(() => {
        if (!cancelled) setMode("error")
      })
    return () => {
      cancelled = true
    }
  }, [customer.id, attempt])
  if (mode === "full") return <FullSection customer={customer} />
  if (mode === "summary")
    return <CustomerOrderSummary key={customer.id} customer={customer} />
  return (
    <Container>
      <Heading level="h2">Orders</Heading>
      <Text className="py-4">
        {mode === "error"
          ? "Unable to verify order access."
          : "Loading orders…"}
      </Text>
      {mode === "error" && (
        <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      )}
    </Container>
  )
}

function CustomerOrderSummary({ customer }: { customer: Customer }) {
  const [offset, setOffset] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [data, setData] = useState<{
    orders: OrderSummary[]
    count: number
  } | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setError(false)
    fetch(
      `/admin/customers/${encodeURIComponent(customer.id)}/order-summary?offset=${offset}&limit=10`,
      { credentials: "include", signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load orders")
        return response.json()
      })
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [customer.id, offset, attempt])
  const label = (value: string) => (value ? value.replace(/_/g, " ") : "—")
  const amount = (order: OrderSummary) => {
    if (
      order.total == null ||
      !order.currency_code ||
      !Number.isFinite(Number(order.total))
    )
      return "Not available"
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: order.currency_code.toUpperCase(),
      }).format(Number(order.total))
    } catch {
      return "Not available"
    }
  }
  return (
    <Container className="divide-y p-0" data-customer-order-summary>
      <div className="px-6 py-4">
        <Heading level="h2">Orders</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Order summary only. Order details and actions require Orders
          permission.
        </Text>
      </div>
      {error ? (
        <div className="px-6 py-4" role="alert">
          <Text>
            Unable to load the order summary. Customer details are still
            available.
          </Text>
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      ) : !data ? (
        <Text className="px-6 py-4" role="status">
          Loading orders…
        </Text>
      ) : !data.count ? (
        <Text className="px-6 py-6">No orders for this customer.</Text>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table
              className="w-full text-left text-sm"
              aria-label="Customer order summary"
            >
              <thead>
                <tr>
                  {[
                    "Order",
                    "Date",
                    "Status",
                    "Payment",
                    "Fulfillment",
                    "Total",
                  ].map((title) => (
                    <th
                      className="px-4 py-3 font-medium text-ui-fg-subtle"
                      key={title}
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order) => (
                  <tr key={order.id} className="border-t border-ui-border-base">
                    <td className="px-4 py-3">#{order.display_id}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {label(order.status)}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {label(order.payment_status)}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {label(order.fulfillment_status)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {amount(order)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 px-6 py-4">
            <Text size="small">
              {offset + 1}–{Math.min(offset + 10, data.count)} of {data.count}
            </Text>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={!offset}
                onClick={() => setOffset((n) => Math.max(0, n - 10))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={offset + 10 >= data.count}
                onClick={() => setOffset((n) => n + 10)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </Container>
  )
}
