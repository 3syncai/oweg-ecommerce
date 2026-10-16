import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@medusajs/ui"

type Overview = {
  id: string
  payment: string
  quantity: number | null
  status: string
  stores: { name: string; status: string }[]
}

export function useOwegOrderListColumns(nativeColumns: any[], orders: any[] = []) {
  const ids = orders.map((order) => order.id).sort().join(",")
  const { data, isError } = useQuery<{ orders: Overview[] }>({
    queryKey: ["oweg-order-list-overview", ids],
    enabled: !!ids,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/admin/orders/list-overview?${new URLSearchParams({ ids })}`, {
        credentials: "include", cache: "no-store", signal,
      })
      if (!response.ok) throw new Error("Order overview could not be loaded")
      return response.json()
    },
    staleTime: 0,
  })
  return useMemo(() => {
    const byId = new Map((data?.orders || []).map((order) => [order.id, order]))
    const pending = <span className="text-ui-fg-muted" title={isError ? "Refresh to retry loading order information" : undefined}>
      {isError ? "Unavailable" : "Loading…"}
    </span>
    const native = (key: string, label: string) => ({
      ...nativeColumns.find((column) => column.accessorKey === key),
      header: () => label,
    })
    const statusBadge = (value: string, title?: string) => (
      <span title={title}>
        <Badge color={value === "Delivered" ? "green" : value === "Cancelled" ? "red" :
          value.includes("Returned") ? "orange" : "grey"}>{value}</Badge>
      </span>
    )
    return [
      native("display_id", "Order No."),
      native("created_at", "Date"),
      native("customer", "Customer Name"),
      { id: "oweg_payment", header: () => "Payment", cell: ({ row }: any) =>
        byId.get(row.original.id)?.payment || pending },
      { id: "oweg_status", header: () => "Status", cell: ({ row }: any) => {
        const order = byId.get(row.original.id)
        if (!order) return pending
        return <div className="flex min-w-[130px] flex-col gap-1 py-2">
          {order.stores.length > 1
            ? order.stores.map((store, index) => <div key={index} className="flex flex-col gap-1">
                <span className="text-ui-fg-subtle text-xs">{store.name}</span>
                {statusBadge(store.status)}
              </div>)
            : statusBadge(order.status)}
        </div>
      } },
      { id: "oweg_quantity", header: () => "Order Qty", cell: ({ row }: any) => {
        const order = byId.get(row.original.id)
        return order ? order.quantity === null ? "Not available" : `${order.quantity} nos` : pending
      } },
      native("total", "Order Amount"),
      { id: "oweg_store", header: () => "Store Name", cell: ({ row }: any) => {
        const order = byId.get(row.original.id)
        return order ? <div className="min-w-[140px] max-w-[240px] whitespace-normal py-2">
          {order.stores.length ? order.stores.map((store, index) => <div key={index}>{store.name}</div>) :
            <span className="text-ui-fg-muted">Not available</span>}
        </div> : pending
      } },
    ]
  }, [nativeColumns, data, isError])
}
