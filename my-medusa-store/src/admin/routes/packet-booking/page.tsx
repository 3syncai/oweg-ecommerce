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
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

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
  invoice_generated_at?: string | null
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
  easy_booking_status?: string | null
  status: "awaiting_booking" | "booked"
}

type Courier = {
  courier_id: number
  courier_name: string
  rate: number | null
  etd: string | null
  freight_charge: number | null
  cod_charges?: number | null
  gst_amount?: number | null
  charge_weight?: number | null
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
  package: {
    weight: number
    length: number
    breadth: number
    height: number
    volumetric_weight?: number
    chargeable_weight?: number
  }
  payment_type: string
  items: Array<{
    id: string
    title: string
    quantity: number
    unit_price?: number
    variant_title?: string | null
  }>
  provider: string
  provider_label: string
  couriers: Courier[]
  courier_error: string | null
  pincode_not_serviceable?: boolean
  already_booked: boolean
  can_rebook?: boolean
  tracking?: {
    current_status?: string | null
    status?: string | null
    error?: string | null
    tracking_data?: {
      courier_name?: string | null
      shipment_track_activities?: Array<Record<string, unknown>>
    }
  } | null
  workflow: {
    easy_courier_id?: number | null
    easy_courier_partner?: string | null
    easy_booking_status?: string | null
    easy_cancelled_at?: string | null
    easy_tracking_status?: string | null
    shiprocket_awb?: string | null
    tracking_number?: string | null
    tracking_url?: string | null
    admin_booked_at?: string | null
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

const isDummyAwb = (awb: string | null | undefined) =>
  /DUMMY|ITL-DUMMY|ITL-REV-DUMMY/i.test(String(awb || ""))

const humanizeStatus = (raw: string | null | undefined) => {
  const s = String(raw || "").trim()
  if (!s || /^unknown$/i.test(s)) return "Awaiting first scan"
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const statusBadgeColor = (
  status: string
): "green" | "orange" | "blue" | "red" | "grey" | "purple" => {
  const s = status.toLowerCase()
  if (/deliver|cash.?collect/.test(s)) return "green"
  if (/cancel|rto|fail|ndr/.test(s)) return "red"
  if (/out.?for|ofd/.test(s)) return "purple"
  if (/transit|pickup|manifest|awb|book/.test(s)) return "blue"
  if (/await|pending|unknown/.test(s)) return "orange"
  return "grey"
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success("Copied")
  } catch {
    toast.error("Could not copy")
  }
}

const MetaRow = ({
  label,
  children,
  mono,
}: {
  label: string
  children: ReactNode
  mono?: boolean
}) => (
  <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2 py-1.5 text-sm">
    <span className="text-ui-fg-muted">{label}</span>
    <span className={mono ? "font-mono text-[13px] tracking-tight" : ""}>
      {children}
    </span>
  </div>
)

const PacketBookingPage = () => {
  const [tab, setTab] = useState<"open" | "booked">("open")
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<QueueItem | null>(null)
  const [detail, setDetail] = useState<DetailPayload | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [booking, setBooking] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null)
  const [pkg, setPkg] = useState({
    weight: "",
    length: "",
    breadth: "",
    height: "",
  })

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(
        `/admin/packet-booking?status=${tab}&limit=100&_=${Date.now()}`,
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
      toast.error(e?.message || "Failed to load packet booking queue")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  const fetchDetail = async (
    item: QueueItem,
    dims?: { weight: string; length: string; breadth: string; height: string }
  ) => {
    const qs = new URLSearchParams()
    const d = dims || {
      weight: item.package_weight != null ? String(item.package_weight) : "",
      length: item.package_length != null ? String(item.package_length) : "",
      breadth: item.package_breadth != null ? String(item.package_breadth) : "",
      height: item.package_height != null ? String(item.package_height) : "",
    }
    if (d.weight) qs.set("weight", d.weight)
    if (d.length) qs.set("length", d.length)
    if (d.breadth) qs.set("breadth", d.breadth)
    if (d.height) qs.set("height", d.height)
    const res = await fetch(
      `/admin/packet-booking/${item.order_id}/${item.vendor_id}?${qs}`,
      { credentials: "include", cache: "no-store" }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || "Failed to load detail")
    return data as DetailPayload
  }

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
      const data = await fetchDetail(item)
      setDetail(data)
      setPkg({
        weight: String(data.package?.weight ?? ""),
        length: String(data.package?.length ?? ""),
        breadth: String(data.package?.breadth ?? ""),
        height: String(data.package?.height ?? ""),
      })
      setSelectedCourierId(
        data.workflow?.easy_courier_id || data.couriers?.[0]?.courier_id || null
      )
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
      const data = await fetchDetail(selected, pkg)
      setDetail(data)
      if (
        selectedCourierId == null ||
        !data.couriers?.some((c) => c.courier_id === selectedCourierId)
      ) {
        setSelectedCourierId(data.couriers?.[0]?.courier_id ?? null)
      }
      if (data.already_booked) {
        toast.success("Status refreshed")
      } else if (data.pincode_not_serviceable) {
        toast.error(
          "Pincode not serviceable right now. Try again later or adjust package dims."
        )
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to refresh")
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
      if (!res.ok) {
        if (data.pincode_not_serviceable) {
          toast.error(
            data.message ||
              "Pincode not serviceable. Refresh rates later and book again."
          )
          await refreshCouriers()
          return
        }
        throw new Error(data.message || "Booking failed")
      }
      toast.success(data.awb ? `Booked · AWB ${data.awb}` : "Courier booked")
      setSelected(null)
      setDetail(null)
      setTab("booked")
      await loadQueue()
    } catch (e: any) {
      toast.error(e?.message || "Booking failed")
    } finally {
      setBooking(false)
    }
  }

  const submitCancel = async () => {
    if (!selected) return
    const awb =
      detail?.workflow?.shiprocket_awb ||
      detail?.workflow?.tracking_number ||
      selected.shiprocket_awb
    const dummy = isDummyAwb(awb)
    if (
      !window.confirm(
        dummy
          ? `Clear dummy booking ${awb}? You can then book on live ITL.`
          : awb
            ? `Cancel AWB ${awb} on ITL? You can rebook after.`
            : "Cancel this Easy Ship booking?"
      )
    ) {
      return
    }
    setCancelling(true)
    try {
      const res = await fetch(
        `/admin/packet-booking/${selected.order_id}/${selected.vendor_id}`,
        { method: "DELETE", credentials: "include" }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Cancel failed")
      toast.success(
        dummy ? "Dummy booking cleared — pick a live courier" : "Cancelled — ready to rebook"
      )
      setTab("open")
      const refreshed = await fetchDetail(selected, pkg)
      setDetail(refreshed)
      setSelectedCourierId(refreshed.couriers?.[0]?.courier_id ?? null)
      await loadQueue()
    } catch (e: any) {
      toast.error(e?.message || "Cancel failed")
    } finally {
      setCancelling(false)
    }
  }

  const closeModal = () => {
    setSelected(null)
    setDetail(null)
  }

  const awb = String(
    detail?.workflow?.shiprocket_awb ||
      detail?.workflow?.tracking_number ||
      selected?.shiprocket_awb ||
      ""
  ).trim()
  const trackingRaw =
    detail?.tracking?.current_status ||
    detail?.tracking?.status ||
    detail?.workflow?.easy_tracking_status ||
    null
  const trackingLabel = humanizeStatus(trackingRaw)
  const activities = detail?.tracking?.tracking_data?.shipment_track_activities || []
  const selectedCourier = useMemo(
    () => detail?.couriers?.find((c) => c.courier_id === selectedCourierId) || null,
    [detail?.couriers, selectedCourierId]
  )

  return (
    <Container className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Heading level="h1">Packet Booking</Heading>
            <Badge size="2xsmall" color="blue">
              Easy Ship · ITL
            </Badge>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            Book any live courier option, track AWB status, cancel, and rebook when a
            pincode becomes serviceable.
          </Text>
        </div>
        <Button variant="secondary" size="small" onClick={() => void loadQueue()}>
          Refresh list
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          size="small"
          variant={tab === "open" ? "primary" : "secondary"}
          onClick={() => setTab("open")}
        >
          Open queue
          {!loading && tab === "open" ? (
            <span className="ml-1.5 tabular-nums opacity-80">({items.length})</span>
          ) : null}
        </Button>
        <Button
          size="small"
          variant={tab === "booked" ? "primary" : "secondary"}
          onClick={() => setTab("booked")}
        >
          Recent bookings
          {!loading && tab === "booked" ? (
            <span className="ml-1.5 tabular-nums opacity-80">({items.length})</span>
          ) : null}
        </Button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle px-4 py-10 text-center">
          <Text className="text-ui-fg-muted">Loading queue…</Text>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ui-border-base bg-ui-bg-subtle px-4 py-12 text-center">
          <Text weight="plus">Nothing here yet</Text>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {tab === "open"
              ? "Orders land here when a vendor picks Easy Shipping — or after you cancel a booking."
              : "Live bookings with AWB will appear in this list."}
          </Text>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ui-border-base">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-ui-border-base bg-ui-bg-subtle">
                <tr className="text-ui-fg-muted">
                  <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide">
                    Order
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide">
                    Vendor
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide">
                    Pay
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide">
                    PIN
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide">
                    Courier
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide">
                    AWB / status
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const rowAwb = item.shiprocket_awb || item.tracking_number
                  const dummy = isDummyAwb(rowAwb)
                  return (
                    <tr
                      key={`${item.order_id}:${item.vendor_id}`}
                      className="border-b border-ui-border-base/60 transition-colors last:border-0 hover:bg-ui-bg-subtle/60"
                    >
                      <td className="px-3 py-3 align-top">
                        <Text weight="plus">#{item.order_display_id || "—"}</Text>
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {formatDate(item.rtd_at || item.admin_booked_at)}
                        </Text>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Text size="small" weight="plus">
                          {item.store_name || item.vendor_name || "Vendor"}
                        </Text>
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {item.vendor_email || "—"}
                        </Text>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Badge
                          size="2xsmall"
                          color={item.payment_type === "PostPaid" ? "orange" : "green"}
                        >
                          {item.payment_type === "PostPaid" ? "COD" : "Prepaid"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 align-top tabular-nums">
                        {item.pickup_pincode || "—"}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Text size="small">
                          {item.preferred_courier_partner ||
                            (item.status === "booked" ? "—" : "Admin picks")}
                        </Text>
                        {item.preferred_courier_rate != null ? (
                          <Text size="xsmall" className="text-ui-fg-muted">
                            {formatMoney(item.preferred_courier_rate)}
                          </Text>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {item.status === "booked" ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge size="2xsmall" color="green">
                                Booked
                              </Badge>
                              {dummy ? (
                                <Badge size="2xsmall" color="orange">
                                  Dummy
                                </Badge>
                              ) : null}
                            </div>
                            <Text
                              size="xsmall"
                              className="font-mono text-ui-fg-subtle"
                            >
                              {rowAwb || "AWB pending"}
                            </Text>
                          </div>
                        ) : item.easy_booking_status === "cancelled" ? (
                          <Badge size="2xsmall" color="red">
                            Cancelled · rebook
                          </Badge>
                        ) : (
                          <Badge size="2xsmall" color="orange">
                            Ready to book
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Button
                          size="small"
                          variant={
                            item.status === "awaiting_booking" ? "primary" : "secondary"
                          }
                          onClick={() => void openBooking(item)}
                        >
                          {item.status === "awaiting_booking"
                            ? "Review & book"
                            : "Manage"}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-ui-border-base bg-ui-bg-base shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-ui-border-base px-5 py-4">
              <div>
                <Text size="small" className="text-ui-fg-muted">
                  {detail?.already_booked ? "Shipment" : "New booking"} ·{" "}
                  {detail?.provider_label || "ITL"}
                </Text>
                <Heading level="h2" className="mt-0.5">
                  Order #{selected.order_display_id || "—"}
                </Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  {selected.store_name || selected.vendor_name}
                </Text>
              </div>
              <Button variant="secondary" size="small" onClick={closeModal}>
                Close
              </Button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {detailLoading && !detail ? (
                <Text className="text-ui-fg-muted">Loading order…</Text>
              ) : detail ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
                    <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle/40 p-3.5">
                      <Text
                        size="xsmall"
                        weight="plus"
                        className="mb-2 uppercase tracking-wide text-ui-fg-muted"
                      >
                        Pickup
                      </Text>
                      <Text size="small" weight="plus">
                        {detail.pickup.name}
                      </Text>
                      <Text size="small" className="mt-1 text-ui-fg-subtle">
                        {detail.pickup.address}
                      </Text>
                      <Text size="small" className="text-ui-fg-subtle">
                        {detail.pickup.city}, {detail.pickup.state} ·{" "}
                        <span className="tabular-nums">{detail.pickup.pin_code}</span>
                      </Text>
                      <Text size="small" className="mt-1 text-ui-fg-muted">
                        {detail.pickup.phone}
                      </Text>
                    </div>
                    <div className="hidden items-center justify-center sm:flex">
                      <div className="flex flex-col items-center gap-1 text-ui-fg-muted">
                        <span className="h-2 w-2 rounded-full bg-ui-fg-interactive" />
                        <span className="h-10 w-px bg-ui-border-strong" />
                        <span className="h-2 w-2 rounded-full border-2 border-ui-fg-interactive" />
                      </div>
                    </div>
                    <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle/40 p-3.5">
                      <Text
                        size="xsmall"
                        weight="plus"
                        className="mb-2 uppercase tracking-wide text-ui-fg-muted"
                      >
                        Drop
                      </Text>
                      <Text size="small" weight="plus">
                        {detail.delivery.name || "—"}
                      </Text>
                      <Text size="small" className="mt-1 text-ui-fg-subtle">
                        {detail.delivery.address || "—"}
                      </Text>
                      <Text size="small" className="text-ui-fg-subtle">
                        {[
                          detail.delivery.city,
                          detail.delivery.province,
                          detail.delivery.postal_code,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </Text>
                      <Text size="small" className="mt-1 text-ui-fg-muted">
                        {detail.delivery.phone || "—"}
                      </Text>
                    </div>
                  </div>

                  <div className="rounded-xl border border-ui-border-base p-3.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Text weight="plus">Items</Text>
                      <Badge
                        size="2xsmall"
                        color={detail.payment_type === "PostPaid" ? "orange" : "green"}
                      >
                        {detail.payment_type === "PostPaid" ? "COD" : "Prepaid"}
                      </Badge>
                    </div>
                    <ul className="divide-y divide-ui-border-base">
                      {detail.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"
                        >
                          <span className="text-ui-fg-base">
                            {item.title}
                            {item.variant_title ? (
                              <span className="text-ui-fg-muted">
                                {" "}
                                · {item.variant_title}
                              </span>
                            ) : null}
                            <span className="text-ui-fg-muted"> × {item.quantity}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-ui-fg-subtle">
                            {formatMoney(
                              Number(item.unit_price || 0) * Number(item.quantity || 1)
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {detail.already_booked && (
                    <div className="space-y-3">
                      {isDummyAwb(awb) ? (
                        <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-3.5 py-3">
                          <Text weight="plus">Dummy booking (old simulator)</Text>
                          <Text size="small" className="mt-1 text-ui-fg-subtle">
                            This AWB was created before live ITL. Cancel it, then book again
                            to get a real courier AWB and tracking.
                          </Text>
                        </div>
                      ) : null}

                      <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle/50 p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <Badge size="2xsmall" color="green">
                            Courier booked
                          </Badge>
                          <Badge
                            size="2xsmall"
                            color={statusBadgeColor(String(trackingRaw || "awaiting"))}
                          >
                            {trackingLabel}
                          </Badge>
                          {isDummyAwb(awb) ? (
                            <Badge size="2xsmall" color="orange">
                              Dummy AWB
                            </Badge>
                          ) : null}
                        </div>

                        <div className="divide-y divide-ui-border-base">
                          <MetaRow label="AWB" mono>
                            <span className="inline-flex flex-wrap items-center gap-2">
                              <span>{awb || "—"}</span>
                              {awb ? (
                                <button
                                  type="button"
                                  className="text-xs text-ui-fg-interactive underline"
                                  onClick={() => void copyText(awb)}
                                >
                                  Copy
                                </button>
                              ) : null}
                            </span>
                          </MetaRow>
                          <MetaRow label="Partner">
                            {detail.workflow?.easy_courier_partner ||
                              detail.tracking?.tracking_data?.courier_name ||
                              "—"}
                          </MetaRow>
                          <MetaRow label="Booked">
                            {formatDate(detail.workflow?.admin_booked_at)}
                          </MetaRow>
                          <MetaRow label="Live status">{trackingLabel}</MetaRow>
                        </div>

                        {detail.tracking?.error ? (
                          <Text size="small" className="mt-3 text-ui-fg-subtle">
                            Tracking note: {detail.tracking.error}
                          </Text>
                        ) : null}

                        {activities.length > 0 ? (
                          <div className="mt-4 border-t border-ui-border-base pt-3">
                            <Text
                              size="xsmall"
                              weight="plus"
                              className="mb-2 uppercase tracking-wide text-ui-fg-muted"
                            >
                              Recent scans
                            </Text>
                            <ul className="max-h-36 space-y-2 overflow-y-auto">
                              {activities.slice(0, 6).map((act, idx) => (
                                <li
                                  key={idx}
                                  className="text-xs text-ui-fg-subtle"
                                >
                                  <span className="text-ui-fg-base">
                                    {String(
                                      act.status ||
                                        act.activity ||
                                        act.scan ||
                                        "Update"
                                    )}
                                  </span>
                                  {act.location || act.date ? (
                                    <span className="text-ui-fg-muted">
                                      {" "}
                                      ·{" "}
                                      {[act.location, act.date]
                                        .filter(Boolean)
                                        .map(String)
                                        .join(" · ")}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {detail.workflow?.tracking_url ? (
                          <a
                            href={detail.workflow.tracking_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex text-sm text-ui-fg-interactive underline"
                          >
                            Open tracking page
                          </a>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {!detail.already_booked && (
                    <div className="space-y-3">
                      {detail.workflow?.easy_booking_status === "cancelled" ? (
                        <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle/50 px-3.5 py-3">
                          <Text weight="plus">Ready to rebook</Text>
                          <Text size="small" className="mt-1 text-ui-fg-subtle">
                            Previous booking cancelled{" "}
                            {formatDate(detail.workflow.easy_cancelled_at)}. Choose any
                            live courier below.
                          </Text>
                        </div>
                      ) : null}

                      <div className="rounded-xl border border-ui-border-base p-3.5">
                        <Text weight="plus" className="mb-3">
                          Package
                        </Text>
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
                                  setPkg((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          ))}
                        </div>
                        {detail.package?.chargeable_weight != null ? (
                          <Text size="small" className="mt-2 text-ui-fg-subtle">
                            Volumetric{" "}
                            {Number(detail.package.volumetric_weight || 0).toFixed(2)}{" "}
                            kg · chargeable{" "}
                            <span className="font-medium text-ui-fg-base">
                              {Number(detail.package.chargeable_weight).toFixed(2)} kg
                            </span>
                            {Number(detail.package.chargeable_weight) > 2 ? (
                              <span className="text-orange-600">
                                {" "}
                                — large box dims inflate ITL rates; shrink L/B/H if wrong
                              </span>
                            ) : null}
                          </Text>
                        ) : null}
                      </div>

                      <div className="rounded-xl border border-ui-border-base p-3.5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <Text weight="plus">Courier options</Text>
                            <Text size="small" className="text-ui-fg-subtle">
                              Live ITL totals = freight + COD fee + GST
                              {selectedCourier
                                ? ` · ${selectedCourier.courier_name}`
                                : ""}
                            </Text>
                          </div>
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
                          <div className="mb-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2.5">
                            <Text size="small">{detail.courier_error}</Text>
                            {detail.pincode_not_serviceable ? (
                              <Text size="small" className="mt-1 text-ui-fg-subtle">
                                Not serviceable right now — change dims or retry later,
                                then book again.
                              </Text>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
                          {(detail.couriers || []).map((c) => {
                            const active = selectedCourierId === c.courier_id
                            const total = c.rate ?? c.freight_charge
                            return (
                              <button
                                key={c.courier_id}
                                type="button"
                                onClick={() => setSelectedCourierId(c.courier_id)}
                                className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                                  active
                                    ? "border-ui-fg-interactive bg-ui-bg-interactive/10 ring-1 ring-ui-fg-interactive/30"
                                    : "border-ui-border-base hover:bg-ui-bg-subtle"
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block font-medium">
                                    {c.courier_name}
                                  </span>
                                  <span className="mt-0.5 block text-xs text-ui-fg-muted">
                                    {[
                                      c.etd ? `ETD ${c.etd}` : null,
                                      c.charge_weight != null
                                        ? `slab ${c.charge_weight} kg`
                                        : null,
                                      c.freight_charge != null
                                        ? `freight ${formatMoney(c.freight_charge)}`
                                        : null,
                                      c.cod_charges != null && c.cod_charges > 0
                                        ? `COD ${formatMoney(c.cod_charges)}`
                                        : null,
                                      c.gst_amount != null && c.gst_amount > 0
                                        ? `GST ${formatMoney(c.gst_amount)}`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                </span>
                                <span className="shrink-0 text-right">
                                  <span className="block tabular-nums font-medium">
                                    {formatMoney(total)}
                                  </span>
                                  <span className="text-[11px] text-ui-fg-muted">
                                    total
                                  </span>
                                </span>
                              </button>
                            )
                          })}
                          {!detail.couriers?.length && !detail.courier_error ? (
                            <Text size="small" className="text-ui-fg-muted">
                              No couriers for this lane / package.
                            </Text>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {detail ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ui-border-base bg-ui-bg-subtle/40 px-5 py-3">
                {detail.already_booked ? (
                  <>
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={detailLoading}
                      onClick={() => void refreshCouriers()}
                    >
                      Refresh status
                    </Button>
                    <Button
                      size="small"
                      variant="danger"
                      disabled={cancelling}
                      isLoading={cancelling}
                      onClick={() => void submitCancel()}
                    >
                      {isDummyAwb(awb) ? "Clear & rebook" : "Cancel booking"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="small" variant="secondary" onClick={closeModal}>
                      Close
                    </Button>
                    <Button
                      size="small"
                      disabled={
                        booking || !selectedCourierId || !detail.couriers?.length
                      }
                      isLoading={booking}
                      onClick={() => void submitBook()}
                    >
                      Book{" "}
                      {selectedCourier ? selectedCourier.courier_name : "courier"}
                    </Button>
                  </>
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
