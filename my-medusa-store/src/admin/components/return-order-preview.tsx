import { useEffect, useState } from "react"
import { Button, Drawer, Heading, Text } from "@medusajs/ui"

type OrderPreview = {
  display_id: number
  email?: string
  status: string
  currency_code: string
  total: number
  items: { id: string; title: string; variant_title?: string; quantity: number }[]
}

/** Order context for return approval, without exposing order-management actions. */
export function ReturnOrderPreview({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const [order, setOrder] = useState<OrderPreview | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    setOrder(null)
    setError("")
    if (!orderId) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/admin/orders/${encodeURIComponent(orderId)}?fields=id,display_id,email,status,currency_code,total,*items`, { credentials: "include", signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || "Unable to load this order")
        setOrder(data.order)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load this order")
      }
    })()
    return () => controller.abort()
  }, [orderId])

  return <Drawer open={!!orderId} onOpenChange={open => { if (!open) onClose() }}>
    <Drawer.Content>
      <Drawer.Header><Drawer.Title>Order summary{order ? ` #${order.display_id}` : ""}</Drawer.Title></Drawer.Header>
      <Drawer.Body className="overflow-y-auto">
        <Drawer.Description className="mb-6">Review the order while processing this return. Order changes are managed by the Orders team.</Drawer.Description>
        {error ? <Text role="alert" className="text-ui-fg-error">{error}</Text> : !order ? <Text role="status">Loading order…</Text> : <div className="space-y-6">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt>Customer</dt><dd className="break-all">{order.email || "Not provided"}</dd>
            <dt>Status</dt><dd className="capitalize">{order.status}</dd>
            <dt>Total</dt><dd>{new Intl.NumberFormat("en-IN", { style: "currency", currency: order.currency_code?.toUpperCase() || "INR" }).format(Number(order.total))}</dd>
          </dl>
          <div><Heading level="h2" className="mb-3">Items</Heading><ul className="divide-y divide-ui-border-base">
            {order.items?.map(item => <li key={item.id} className="py-3"><Text weight="plus">{item.title}</Text><Text size="small" className="text-ui-fg-subtle">{item.variant_title} · Quantity: {item.quantity}</Text></li>)}
          </ul></div>
        </div>}
      </Drawer.Body>
      <Drawer.Footer><Button variant="secondary" onClick={onClose}>Close</Button></Drawer.Footer>
    </Drawer.Content>
  </Drawer>
}
