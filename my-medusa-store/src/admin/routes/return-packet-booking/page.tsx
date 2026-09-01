import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  toast,
} from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

type QueueItem = {
  return_id: string
  order_id: string
  order_display_id: string | number | null
  vendor_id: string
  vendor_name: string | null
  store_name: string | null
  return_status: string
  reason: string | null
  approved_at: string | null
  customer_pickup_pincode: string | null
  vendor_delivery_pincode: string | null
  shiprocket_awb: string | null
  reverse_courier_name: string | null
  reverse_courier_rate: number | null
  admin_return_booked_at: string | null
  status: "awaiting_booking" | "booked"
}

type Courier = {
  courier_id: number
  courier_name: string
  rate: number | null
  etd: string | null
  freight_charge: number | null
}

type DetailPayload = {
  return_id: string
  order_id: string
  order_display_id: string | number | null
  return_status: string
  reason: string | null
  vendor: {
    id: string
    name: string | null
    store_name: string | null
    email: string | null
    phone: string | null
  }
  pickup: {
    name: string | null
    phone: string | null
    address: string | null
    city: string | null
    state: string | null
    pin_code: string | null
  }
  delivery: {
    location: string
    name: string
    phone: string
    address: string
    city: string
    state: string
    pin_code: string
  }
  package: { weight: number; length: number; breadth: number; height: number }
  items: Array<{
    id: string
    title: string
    quantity: number
    unit_price?: number
  }>
  provider_label: string
  couriers: Courier[]
  courier_error: string | null
  already_booked: boolean
  shiprocket_awb: string | null
}

const formatMoney = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0)

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

const ReturnPacketBookingPage = () => {
  const [tab, setTab] = useState<"open" | "booked">("open")
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<QueueItem | null>(null)
  const [detail, setDetail] = useState<DetailPayload | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [booking, setBooking] = useState(false)
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null)
  const [pkg, setPkg] = useState({ weight: "", length: "", breadth: "", height: "" })

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(
        `/admin/return-packet-booking?status=${tab}&limit=100&_=${Date.now()}`,
        {
          credentials: "include",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || "Failed to load queue")
      }
      const data = await res.json()
      setItems(data.items || [])
    } catch (e: any) {
      toast.error(e?.message || "Failed to load return packet booking queue")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  const openBookingByReturnId = useCallback(async (returnId: string, queueItem?: QueueItem | null) => {
    setSelected(
      queueItem ||
        ({
          return_id: returnId,
          order_id: "",
          order_display_id: null,
          vendor_id: "",
          vendor_name: null,
          store_name: null,
          return_status: "approved",
          reason: null,
          approved_at: null,
          customer_pickup_pincode: null,
          vendor_delivery_pincode: null,
          shiprocket_awb: null,
          reverse_courier_name: null,
          reverse_courier_rate: null,
          admin_return_booked_at: null,
          status: "awaiting_booking",
        } satisfies QueueItem)
    )
    setDetail(null)
    setSelectedCourierId(null)
    setPkg({ weight: "", length: "", breadth: "", height: "" })
    setDetailLoading(true)
    try {
      const res = await fetch(`/admin/return-packet-booking/${returnId}`, {
        credentials: "include",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Failed to load detail")
      setDetail(data)
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              return_id: returnId,
              order_id: data.order_id,
              order_display_id: data.order_display_id,
              store_name: data.vendor?.store_name || prev.store_name,
              vendor_name: data.vendor?.name || prev.vendor_name,
              reason: data.reason,
              status: data.already_booked ? "booked" : "awaiting_booking",
            }
          : prev
      )
      setPkg({
        weight: String(data.package?.weight ?? ""),
        length: String(data.package?.length ?? ""),
        breadth: String(data.package?.breadth ?? ""),
        height: String(data.package?.height ?? ""),
      })
      setSelectedCourierId(data.couriers?.[0]?.courier_id || null)
    } catch (e: any) {
      toast.error(e?.message || "Failed to open booking")
      setSelected(null)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const openBooking = async (item: QueueItem) => {
    await openBookingByReturnId(item.return_id, item)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const returnId = params.get("return_id")?.trim()
    if (!returnId) return
    void openBookingByReturnId(returnId)
  }, [openBookingByReturnId])

  const refreshCouriers = async () => {
    if (!selected) return
    setDetailLoading(true)
    try {
      const qs = new URLSearchParams()
      if (pkg.weight) qs.set("weight", pkg.weight)
      if (pkg.length) qs.set("length", pkg.length)
      if (pkg.breadth) qs.set("breadth", pkg.breadth)
      if (pkg.height) qs.set("height", pkg.height)
      const res = await fetch(
        `/admin/return-packet-booking/${selected.return_id}?${qs}`,
        { credentials: "include" }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Failed to refresh rates")
      setDetail(data)
      if (!selectedCourierId && data.couriers?.[0]) {
        setSelectedCourierId(data.couriers[0].courier_id)
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to refresh couriers")
    } finally {
      setDetailLoading(false)
    }
  }

  const submitBook = async () => {
    if (!selected || !selectedCourierId) {
      toast.error("Select a courier first")
      return
    }
    const courier = detail?.couriers?.find((c) => c.courier_id === selectedCourierId)
    setBooking(true)
    try {
      const res = await fetch(`/admin/return-packet-booking/${selected.return_id}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          courier_id: selectedCourierId,
          courier_name: courier?.courier_name,
          rate: courier?.rate ?? courier?.freight_charge,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Booking failed")
      toast.success(
        data.awb ? `Return pickup booked · AWB ${data.awb}` : "Return pickup booked"
      )
      setSelected(null)
      setDetail(null)
      await loadQueue()
    } catch (e: any) {
      toast.error(e?.message || "Booking failed")
    } finally {
      setBooking(false)
    }
  }

  return (
    <Container className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h1">Return Packet Booking</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Easy Ship returns appear here after admin approval. Book reverse pickup from
            customer → vendor store.
          </Text>
        </div>
        <Button variant="secondary" size="small" onClick={() => void loadQueue()}>
          Refresh
        </Button>
      </div>

      <div className="mb-4 flex gap-2">
        <Button
          size="small"
          variant={tab === "open" ? "primary" : "secondary"}
          onClick={() => setTab("open")}
        >
          Awaiting booking
        </Button>
        <Button
          size="small"
          variant={tab === "booked" ? "primary" : "secondary"}
          onClick={() => setTab("booked")}
        >
          Booked
        </Button>
      </div>

      {loading ? (
        <Text className="text-ui-fg-muted">Loading…</Text>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-8 text-center">
          <Text weight="plus">No returns in this queue</Text>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {tab === "open"
              ? "Approved Easy Ship returns waiting for reverse pickup booking show here."
              : "Booked return pickups will show here."}
          </Text>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ui-border-base">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ui-border-base bg-ui-bg-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 font-medium">Return</th>
                <th className="px-3 py-2 font-medium">Customer PIN</th>
                <th className="px-3 py-2 font-medium">Vendor PIN</th>
                <th className="px-3 py-2 font-medium">Approved</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.return_id}
                  className="border-b border-ui-border-base/70 last:border-0"
                >
                  <td className="px-3 py-2.5">
                    <Text weight="plus">#{item.order_display_id || "—"}</Text>
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {item.return_id.slice(0, 18)}…
                    </Text>
                  </td>
                  <td className="px-3 py-2.5">
                    <Text size="small" weight="plus">
                      {item.store_name || item.vendor_name || "Vendor"}
                    </Text>
                  </td>
                  <td className="px-3 py-2.5">
                    <Text size="small" className="line-clamp-2">
                      {item.reason || "Return"}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-muted capitalize">
                      {item.return_status.replace(/_/g, " ")}
                    </Text>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {item.customer_pickup_pincode || "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {item.vendor_delivery_pincode || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-ui-fg-subtle">
                    {formatDate(item.approved_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    {item.status === "booked" ? (
                      <div>
                        <Badge size="2xsmall" color="green">
                          Booked
                        </Badge>
                        <Text size="xsmall" className="mt-0.5 text-ui-fg-muted">
                          {item.shiprocket_awb || "AWB pending"}
                          {item.reverse_courier_name
                            ? ` · ${item.reverse_courier_name}`
                            : ""}
                        </Text>
                      </div>
                    ) : (
                      <Badge size="2xsmall" color="orange">
                        Ready to book
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {item.status === "awaiting_booking" ? (
                      <Button size="small" onClick={() => void openBooking(item)}>
                        Review & book
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => void openBooking(item)}
                      >
                        View
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <Heading level="h2">
                  Book return pickup · #{selected.order_display_id || "—"}
                </Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  {selected.store_name || selected.vendor_name} · customer → vendor store
                </Text>
              </div>
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  setSelected(null)
                  setDetail(null)
                }}
              >
                Close
              </Button>
            </div>

            {detailLoading && !detail ? (
              <Text className="text-ui-fg-muted">Loading return…</Text>
            ) : detail ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-ui-border-base p-3">
                    <Text weight="plus" className="mb-2">
                      Pickup (customer)
                    </Text>
                    <Text size="small">{detail.pickup.name || "—"}</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {detail.pickup.address || "—"}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {[detail.pickup.city, detail.pickup.state, detail.pickup.pin_code]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {detail.pickup.phone || "—"}
                    </Text>
                  </div>
                  <div className="rounded-lg border border-ui-border-base p-3">
                    <Text weight="plus" className="mb-2">
                      Drop (vendor store)
                    </Text>
                    <Text size="small">{detail.delivery.name}</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {detail.delivery.address}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {detail.delivery.city}, {detail.delivery.state} —{" "}
                      {detail.delivery.pin_code}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {detail.delivery.phone}
                    </Text>
                  </div>
                </div>

                <div className="rounded-lg border border-ui-border-base p-3">
                  <Text weight="plus" className="mb-2">
                    Return items
                  </Text>
                  <ul className="space-y-1">
                    {detail.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3 text-sm">
                        <span>
                          {item.title} × {item.quantity}
                        </span>
                        <span className="tabular-nums text-ui-fg-subtle">
                          {formatMoney(Number(item.unit_price || 0) * Number(item.quantity || 1))}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {detail.reason ? (
                    <Text size="small" className="mt-2 text-ui-fg-subtle">
                      Reason: {detail.reason}
                    </Text>
                  ) : null}
                </div>

                {!detail.already_booked && (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          ["weight", "Weight (kg)"],
                          ["length", "L (cm)"],
                          ["breadth", "B (cm)"],
                          ["height", "H (cm)"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key}>
                          <Label>{label}</Label>
                          <Input
                            value={pkg[key]}
                            onChange={(e) =>
                              setPkg((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Text size="small" className="text-ui-fg-subtle">
                        Reverse couriers via {detail.provider_label}
                      </Text>
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={detailLoading}
                        onClick={() => void refreshCouriers()}
                      >
                        Refresh rates
                      </Button>
                    </div>
                    {detail.courier_error ? (
                      <Text size="small" className="text-red-600">
                        {detail.courier_error}
                      </Text>
                    ) : null}
                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                      {(detail.couriers || []).map((c) => (
                        <button
                          key={c.courier_id}
                          type="button"
                          onClick={() => setSelectedCourierId(c.courier_id)}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                            selectedCourierId === c.courier_id
                              ? "border-ui-fg-interactive bg-ui-bg-interactive/10"
                              : "border-ui-border-base hover:bg-ui-bg-subtle"
                          }`}
                        >
                          <span>
                            <span className="font-medium">{c.courier_name}</span>
                            {c.etd ? (
                              <span className="ml-2 text-ui-fg-muted">ETD {c.etd}</span>
                            ) : null}
                          </span>
                          <span className="tabular-nums font-medium">
                            {formatMoney(c.rate ?? c.freight_charge)}
                          </span>
                        </button>
                      ))}
                      {!detail.couriers?.length && !detail.courier_error ? (
                        <Text size="small" className="text-ui-fg-muted">
                          No reverse couriers for this pincode pair.
                        </Text>
                      ) : null}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelected(null)
                          setDetail(null)
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={booking || !selectedCourierId}
                        isLoading={booking}
                        onClick={() => void submitBook()}
                      >
                        Book return pickup
                      </Button>
                    </div>
                  </>
                )}

                {detail.already_booked && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <Text weight="plus" className="text-emerald-800">
                      Return pickup already booked
                    </Text>
                    <Text size="small" className="text-emerald-900/80">
                      AWB: {detail.shiprocket_awb || "—"}
                    </Text>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Return Packet Booking",
  icon: ArrowPath,
})

export default ReturnPacketBookingPage
