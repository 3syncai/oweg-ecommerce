import { defineRouteConfig } from "@medusajs/admin-sdk"
import { TruckFast } from "@medusajs/icons"
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
  order_id: string
  order_display_id: string | number | null
  vendor_id: string
  vendor_name: string | null
  store_name: string | null
  vendor_email: string | null
  payment_type: string
  stage: string | null
  rtd_at: string | null
  preferred_courier_partner: string | null
  preferred_courier_rate: number | null
  preferred_courier_id: number | null
  pickup_pincode: string | null
  package_weight: number | null
  package_length: number | null
  package_breadth: number | null
  package_height: number | null
  shiprocket_awb: string | null
  tracking_number: string | null
  admin_booked_at: string | null
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
  order_id: string
  order_display_id: string | number | null
  vendor: {
    id: string
    name: string | null
    store_name: string | null
    email: string | null
    phone: string | null
  }
  pickup: {
    location: string
    name: string
    phone: string
    address: string
    city: string
    state: string
    pin_code: string
  }
  delivery: {
    name: string | null
    phone: string | null
    address: string | null
    city: string | null
    province: string | null
    postal_code: string | null
  }
  package: { weight: number; length: number; breadth: number; height: number }
  payment_type: string
  items: Array<{
    id: string
    title: string
    quantity: number
    unit_price?: number
    variant_title?: string | null
  }>
  provider_label: string
  couriers: Courier[]
  courier_error: string | null
  already_booked: boolean
  workflow: {
    easy_courier_id?: number | null
    easy_courier_partner?: string | null
    shiprocket_awb?: string | null
  }
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

const PacketBookingPage = () => {
  const [tab, setTab] = useState<"awaiting_booking" | "booked">("awaiting_booking")
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
      const res = await fetch(`/admin/packet-booking?status=${tab}&limit=100`, {
        credentials: "include",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || "Failed to load queue")
      }
      const data = await res.json()
      setItems(data.items || [])
    } catch (e: any) {
      toast.error(e?.message || "Failed to load packet booking queue")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  const openBooking = async (item: QueueItem) => {
    setSelected(item)
    setDetail(null)
    setSelectedCourierId(item.preferred_courier_id || null)
    setPkg({
      weight: item.package_weight != null ? String(item.package_weight) : "",
      length: item.package_length != null ? String(item.package_length) : "",
      breadth: item.package_breadth != null ? String(item.package_breadth) : "",
      height: item.package_height != null ? String(item.package_height) : "",
    })
    setDetailLoading(true)
    try {
      const qs = new URLSearchParams()
      if (item.package_weight) qs.set("weight", String(item.package_weight))
      if (item.package_length) qs.set("length", String(item.package_length))
      if (item.package_breadth) qs.set("breadth", String(item.package_breadth))
      if (item.package_height) qs.set("height", String(item.package_height))
      const res = await fetch(
        `/admin/packet-booking/${item.order_id}/${item.vendor_id}?${qs}`,
        { credentials: "include" }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Failed to load detail")
      setDetail(data)
      setPkg({
        weight: String(data.package?.weight ?? ""),
        length: String(data.package?.length ?? ""),
        breadth: String(data.package?.breadth ?? ""),
        height: String(data.package?.height ?? ""),
      })
      const preferred =
        data.workflow?.easy_courier_id ||
        data.couriers?.[0]?.courier_id ||
        null
      setSelectedCourierId(preferred)
    } catch (e: any) {
      toast.error(e?.message || "Failed to open booking")
      setSelected(null)
    } finally {
      setDetailLoading(false)
    }
  }

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
        `/admin/packet-booking/${selected.order_id}/${selected.vendor_id}?${qs}`,
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
      const res = await fetch(
        `/admin/packet-booking/${selected.order_id}/${selected.vendor_id}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            courier_id: selectedCourierId,
            courier_partner_name: courier?.courier_name,
            rate: courier?.rate ?? courier?.freight_charge,
            weight: Number(pkg.weight) || undefined,
            length: Number(pkg.length) || undefined,
            breadth: Number(pkg.breadth) || undefined,
            height: Number(pkg.height) || undefined,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Booking failed")
      toast.success(
        data.awb ? `Courier booked · AWB ${data.awb}` : "Courier booked"
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
          <Heading level="h1">Packet Booking</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Vendors choose Easy Ship and mark RTD. Review addresses here, then book the
            courier.
          </Text>
        </div>
        <Button variant="secondary" size="small" onClick={() => void loadQueue()}>
          Refresh
        </Button>
      </div>

      <div className="mb-4 flex gap-2">
        <Button
          size="small"
          variant={tab === "awaiting_booking" ? "primary" : "secondary"}
          onClick={() => setTab("awaiting_booking")}
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
          <Text weight="plus">No orders in this queue</Text>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {tab === "awaiting_booking"
              ? "Orders appear after the vendor chooses Easy Ship and clicks RTD."
              : "Booked Easy Ship packets will show here."}
          </Text>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ui-border-base">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ui-border-base bg-ui-bg-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 font-medium">Payment</th>
                <th className="px-3 py-2 font-medium">Pickup PIN</th>
                <th className="px-3 py-2 font-medium">RTD</th>
                <th className="px-3 py-2 font-medium">Preferred</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={`${item.order_id}:${item.vendor_id}`}
                  className="border-b border-ui-border-base/70 last:border-0"
                >
                  <td className="px-3 py-2.5">
                    <Text weight="plus">#{item.order_display_id || "—"}</Text>
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {item.order_id.slice(0, 18)}…
                    </Text>
                  </td>
                  <td className="px-3 py-2.5">
                    <Text size="small" weight="plus">
                      {item.store_name || item.vendor_name || "Vendor"}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {item.vendor_email || item.vendor_id.slice(0, 12)}
                    </Text>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge size="2xsmall" color={item.payment_type === "PostPaid" ? "orange" : "green"}>
                      {item.payment_type}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{item.pickup_pincode || "—"}</td>
                  <td className="px-3 py-2.5 text-ui-fg-subtle">{formatDate(item.rtd_at)}</td>
                  <td className="px-3 py-2.5">
                    {item.preferred_courier_partner || "—"}
                    {item.preferred_courier_rate != null ? (
                      <Text size="xsmall" className="text-ui-fg-muted">
                        {formatMoney(item.preferred_courier_rate)}
                      </Text>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    {item.status === "booked" ? (
                      <div>
                        <Badge size="2xsmall" color="green">
                          Booked
                        </Badge>
                        <Text size="xsmall" className="mt-0.5 text-ui-fg-muted">
                          {item.shiprocket_awb || item.tracking_number || "AWB pending"}
                        </Text>
                      </div>
                    ) : (
                      <Badge size="2xsmall" color="orange">
                        Awaiting booking
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
                  Book packet · #{selected.order_display_id || "—"}
                </Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  {selected.store_name || selected.vendor_name} · review addresses then book
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
              <Text className="text-ui-fg-muted">Loading order…</Text>
            ) : detail ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-ui-border-base p-3">
                    <Text weight="plus" className="mb-2">
                      Pickup (vendor)
                    </Text>
                    <Text size="small">{detail.pickup.name}</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {detail.pickup.address}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {detail.pickup.city}, {detail.pickup.state} — {detail.pickup.pin_code}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {detail.pickup.phone}
                    </Text>
                  </div>
                  <div className="rounded-lg border border-ui-border-base p-3">
                    <Text weight="plus" className="mb-2">
                      Drop (customer)
                    </Text>
                    <Text size="small">{detail.delivery.name || "—"}</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {detail.delivery.address || "—"}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {[detail.delivery.city, detail.delivery.province, detail.delivery.postal_code]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {detail.delivery.phone || "—"}
                    </Text>
                  </div>
                </div>

                <div className="rounded-lg border border-ui-border-base p-3">
                  <Text weight="plus" className="mb-2">
                    Items · {detail.payment_type}
                  </Text>
                  <ul className="space-y-1">
                    {detail.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3 text-sm">
                        <span>
                          {item.title}
                          {item.variant_title ? ` · ${item.variant_title}` : ""} ×{" "}
                          {item.quantity}
                        </span>
                        <span className="tabular-nums text-ui-fg-subtle">
                          {formatMoney(Number(item.unit_price || 0) * Number(item.quantity || 1))}
                        </span>
                      </li>
                    ))}
                  </ul>
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
                        Couriers via {detail.provider_label}
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
                          No couriers returned for this pincode / package.
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
                        Book courier
                      </Button>
                    </div>
                  </>
                )}

                {detail.already_booked && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <Text weight="plus" className="text-emerald-800">
                      Courier already booked
                    </Text>
                    <Text size="small" className="text-emerald-900/80">
                      AWB: {detail.workflow?.shiprocket_awb || "—"}
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
  label: "Packet Booking",
  icon: TruckFast,
})

export default PacketBookingPage
