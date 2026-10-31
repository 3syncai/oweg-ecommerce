import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Heading, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

type VendorAcceptanceItem = {
  id: string
  title?: string
  variant_title?: string | null
  sku?: string | null
  quantity?: number
}

type ReplacementOffer = {
  variant_id?: string
  vendor_id: string
  store_name?: string | null
  vendor_name?: string | null
  vendor_email?: string | null
  available: number
  sku: string
  unit_price?: number
  variant_title?: string | null
  options?: Record<string, string>
}

type CustomerReplacementRequest = {
  id: string
  item_id: string
  status: string
  options: ReplacementOffer[]
  selected_variant_id?: string | null
  response_source?: string | null
  email_sent_at?: string | null
  email_error?: string | null
  decision_email_error?: string | null
  consent_code_sent_at?: string | null
  expires_at?: string | null
  adjustment_amount?: number | null
  razorpay_refund_id?: string | null
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })

type VendorAcceptance = {
  vendor_id: string
  vendor_name?: string | null
  store_name?: string | null
  vendor_email?: string | null
  vendor_phone?: string | null
  accepted: boolean
  acceptance_label: string
  stage: string
  stage_label: string
  can_relocate?: boolean
  accepted_at?: string | null
  assigned_at?: string | null
  acceptance_deadline_at?: string | null
  acceptance_overdue?: boolean
  shipping_method?: string | null
  shipping_provider?: string | null
  easy_courier_partner?: string | null
  self_courier_partner?: string | null
  self_awb?: string | null
  shiprocket_awb?: string | null
  shiprocket_status?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  label_url?: string | null
  invoice_generated_at?: string | null
  rtd_at?: string | null
  items: VendorAcceptanceItem[]
  item_count: number
}

type VendorAcceptanceResponse = {
  status?: string
  cancellation?: {
    is_cancelled?: boolean
    source?: "admin" | "customer" | null
    note?: string | null
    vendor_message?: string | null
    cancelled_by_label?: string
  }
  vendors: VendorAcceptance[]
  summary: {
    vendor_count: number
    accepted_count: number
    pending_count: number
    all_accepted: boolean
    any_accepted: boolean
    status_label: string
  }
}

function getOrderIdFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  const index = parts.indexOf("orders")
  if (index === -1) return null
  return parts[index + 1] || null
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    timeZoneName: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function visibleSku(value?: string | null) {
  return value?.trim().toUpperCase().startsWith("OWEG-OFFER-") ? "" : value
}

const Detail = ({ label, value }: { label: string; value: ReactNode }) => {
  if (value == null || value === "" || value === "—") return null
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <Text size="small" className="text-ui-fg-muted shrink-0">
        {label}
      </Text>
      <Text size="small" weight="plus" className="text-right break-all text-ui-fg-base">
        {value}
      </Text>
    </div>
  )
}

function stageBadgeColor(
  vendor: VendorAcceptance
): "green" | "orange" | "blue" | "grey" | "red" {
  if (vendor.stage === "delivered") return "green"
  if (vendor.stage === "in_transit" || vendor.stage === "to_dispatch") return "blue"
  if (vendor.accepted) return "green"
  return "orange"
}

const OrderVendorAcceptanceWidget = () => {
  const [data, setData] = useState<VendorAcceptanceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [relocatingItemId, setRelocatingItemId] = useState<string | null>(null)
  const [replacementOffers, setReplacementOffers] = useState<ReplacementOffer[]>([])
  const [alternativeOffers, setAlternativeOffers] = useState<ReplacementOffer[]>([])
  const [selectedAlternatives, setSelectedAlternatives] = useState<string[]>([])
  const [customerRequests, setCustomerRequests] = useState<CustomerReplacementRequest[]>([])
  const [customerNote, setCustomerNote] = useState("")
  const [adminSelectedVariants, setAdminSelectedVariants] = useState<Record<string, string>>({})
  const [adminResponseNotes, setAdminResponseNotes] = useState<Record<string, string>>({})
  const [adminContactMethods, setAdminContactMethods] = useState<Record<string, string>>({})
  const [adminConsentCodes, setAdminConsentCodes] = useState<Record<string, string>>({})
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null)
  const [refundReferences, setRefundReferences] = useState<Record<string, string>>({})
  const [replacementPrice, setReplacementPrice] = useState<number | null>(null)
  const [targetVendorId, setTargetVendorId] = useState("")
  const [relocationReason, setRelocationReason] = useState("")
  const [relocationLoading, setRelocationLoading] = useState(false)
  const [relocationError, setRelocationError] = useState("")

  const orderId = useMemo(() => {
    if (typeof window === "undefined") return null
    return getOrderIdFromPath(window.location.pathname)
  }, [])

  const load = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    setError("")
    try {
      const [res, requestsRes] = await Promise.all([
        fetch(`/admin/orders/${orderId}/vendor-acceptance`, { credentials: "include" }),
        fetch(`/admin/orders/${orderId}/replacement-requests`, { credentials: "include" }),
      ])
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const json = (await res.json()) as VendorAcceptanceResponse
      setData(json)
      if (requestsRes.ok) {
        const requestData = await requestsRes.json()
        setCustomerRequests(requestData.requests || [])
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load vendor status")
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    if (!orderId) return
    void load()
    const intervalId = window.setInterval(() => void load(), 20000)
    return () => window.clearInterval(intervalId)
  }, [orderId, load])

  const openRelocation = async (itemId: string) => {
    if (!orderId) return
    setRelocatingItemId(itemId)
    setReplacementOffers([])
    setAlternativeOffers([])
    setSelectedAlternatives([])
    setCustomerNote("")
    setReplacementPrice(null)
    setTargetVendorId("")
    setRelocationReason("")
    setRelocationError("")
    setRelocationLoading(true)
    try {
      const res = await fetch(`/admin/orders/${orderId}/reshuffle?item_id=${encodeURIComponent(itemId)}`, { credentials: "include" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || `Could not find replacement vendors (${res.status})`)
      const offers = (json.offers || []) as ReplacementOffer[]
      const alternatives = (json.alternatives || []) as ReplacementOffer[]
      setReplacementOffers(offers)
      setAlternativeOffers(alternatives)
      setReplacementPrice(Number.isFinite(Number(json.unit_price)) ? Number(json.unit_price) : null)
      setTargetVendorId("")
      if (!offers.length && !alternatives.length) setRelocationError("No approved vendor currently has this product in stock.")
    } catch (error: any) {
      setRelocationError(error?.message || "Could not find replacement vendors")
    } finally {
      setRelocationLoading(false)
    }
  }

  const submitRelocation = async () => {
    if (!orderId || !relocatingItemId || !targetVendorId || relocationReason.trim().length < 3) return
    setRelocationLoading(true)
    setRelocationError("")
    try {
      const res = await fetch(`/admin/orders/${orderId}/reshuffle`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: relocatingItemId, target_vendor_id: targetVendorId,
          cancel_vendor_assignment: true, reason: relocationReason.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || `Relocation failed (${res.status})`)
      if (json.vendor_cancellation_charge_status === "pending")
        toast.error("Item shuffled. The outgoing vendor charge is pending reconciliation.")
      else if (json.vendor_cancellation_charge_status === "waived")
        toast.success("Item shuffled; no cancellation fee is configured for the outgoing vendor")
      else
        toast.success("Item shuffled; outgoing vendor cancellation fee charged")
      window.location.reload()
    } catch (error: any) {
      setRelocationError(error?.message || "Could not relocate item")
    } finally {
      setRelocationLoading(false)
    }
  }

  const requestCustomerChoice = async () => {
    if (!orderId || !relocatingItemId || !selectedAlternatives.length) return
    setRelocationLoading(true)
    setRelocationError("")
    try {
      const options = alternativeOffers
        .filter((offer) => selectedAlternatives.includes(`${offer.variant_id}:${offer.vendor_id}:${offer.unit_price}`))
        .map((offer) => ({ variant_id: offer.variant_id, vendor_id: offer.vendor_id, unit_price: offer.unit_price }))
      const res = await fetch(`/admin/orders/${orderId}/replacement-requests`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: relocatingItemId, options, message: customerNote.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || `Could not request approval (${res.status})`)
      toast.success(json.email_sent ? "Customer choice request sent" : "Request saved; customer email needs attention")
      setRelocatingItemId(null)
      await load()
    } catch (error: any) {
      setRelocationError(error?.message || "Could not request customer approval")
    } finally {
      setRelocationLoading(false)
    }
  }

  const recordCustomerDecision = async (requestId: string, decision: "accept" | "reject") => {
    if (!orderId) return
    const variantId = adminSelectedVariants[requestId] || ""
    const note = (adminResponseNotes[requestId] || "").trim()
    if (note.length < 15 || !adminContactMethods[requestId]
      || (decision === "accept" && (!variantId || !/^\d{8}$/.test(adminConsentCodes[requestId] || "")))) return
    setRespondingRequestId(requestId)
    try {
      const res = await fetch(`/admin/orders/${orderId}/replacement-requests/${encodeURIComponent(requestId)}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, variant_id: variantId, note,
          contact_method: adminContactMethods[requestId], consent_code: adminConsentCodes[requestId] || "" }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || `Could not record decision (${res.status})`)
      toast.success(decision === "reject" ? "Customer rejection recorded"
        : json.status === "applied" ? "Customer approval recorded and item assigned"
          : "Customer approval recorded; payment adjustment is pending")
      await load()
    } catch (error: any) {
      toast.error(error?.message || "Could not record customer decision")
    } finally {
      setRespondingRequestId(null)
    }
  }

  const sendCustomerConsentCode = async (requestId: string) => {
    if (!orderId || !adminSelectedVariants[requestId]) return
    setRespondingRequestId(requestId)
    try {
      const res = await fetch(`/admin/orders/${orderId}/replacement-requests/${encodeURIComponent(requestId)}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_consent_code", variant_id: adminSelectedVariants[requestId] }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || `Could not send code (${res.status})`)
      setAdminConsentCodes((current) => ({ ...current, [requestId]: "" }))
      toast.success("Confirmation code emailed to customer")
      await load()
    } catch (error: any) {
      toast.error(error?.message || "Could not send confirmation code")
    } finally {
      setRespondingRequestId(null)
    }
  }

  const checkAdjustment = async (requestId: string, action: "check_refund" | "retry_assignment" | "resend_email" | "resend_decision_email" | "record_manual_refund") => {
    if (!orderId) return
    setRespondingRequestId(requestId)
    try {
      const response = await fetch(`/admin/orders/${orderId}/replacement-requests/${encodeURIComponent(requestId)}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, refund_id: refundReferences[requestId] || "",
          reference_id: refundReferences[requestId] || "", note: adminResponseNotes[requestId] || "" }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.message || "Could not check payment adjustment")
      toast.success(result.status === "applied" ? "Replacement assigned to the new vendor"
        : action === "resend_email" ? "Customer email sent" : result.message || "Refund still processing")
      await load()
    } catch (error: any) {
      toast.error(error?.message || "Payment adjustment needs review")
    } finally { setRespondingRequestId(null) }
  }

  if (!orderId) return null

  const summary = data?.summary
  const vendors = data?.vendors || []
  const orderCancelled =
    data?.cancellation?.is_cancelled === true ||
    String(data?.status || "").toLowerCase() === "canceled" ||
    String(data?.status || "").toLowerCase() === "cancelled"

  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-xl border border-ui-border-base overflow-hidden transition-shadow duration-200 hover:shadow-elevation-card-hover">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ui-border-base">
        <div className="min-w-0">
          <Heading level="h2" className="text-ui-fg-base">
            Vendors
          </Heading>
          <Text size="small" className="text-ui-fg-muted mt-0.5">
            {summary
              ? `${summary.accepted_count}/${summary.vendor_count} accepted`
              : "Acceptance & dispatch"}
          </Text>
        </div>
        {orderCancelled ? (
          <Badge size="small" color="red" className="shrink-0">
            Cancelled
          </Badge>
        ) : summary ? (
          <Badge
            size="small"
            color={
              summary.all_accepted ? "green" : summary.any_accepted ? "orange" : "grey"
            }
            className="shrink-0"
          >
            {summary.status_label}
          </Badge>
        ) : null}
      </div>

      <div className="px-5 py-4 space-y-4">
        {orderCancelled && (
          <div className="rounded-lg border border-ui-border-error/40 bg-ui-bg-subtle px-3.5 py-3">
            <Text size="small" weight="plus" className="text-ui-fg-base">
              {data?.cancellation?.cancelled_by_label || "This order has been cancelled."}
            </Text>
            {data?.cancellation?.vendor_message ? (
              <Text size="small" className="text-ui-fg-muted mt-1 leading-relaxed">
                Vendor note: {data.cancellation.vendor_message}
              </Text>
            ) : null}
            {data?.cancellation?.customer_reason ? (
              <Text size="small" className="text-ui-fg-muted mt-1 leading-relaxed">
                Customer message: {data.cancellation.customer_reason}
              </Text>
            ) : null}
          </div>
        )}

        {loading && !data && (
          <Text size="small" className="text-ui-fg-muted">
            Loading…
          </Text>
        )}
        {error && (
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        )}
        {customerRequests.map((request) => (
          <div key={request.id} className="space-y-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Text size="small" weight="plus">Customer replacement choice</Text>
                <Text size="xsmall" className="mt-0.5 text-ui-fg-muted">
                  {request.options.length} {request.options.length === 1 ? "option" : "options"} offered
                  {request.email_sent_at ? " · Email sent" : request.email_error ? " · Email failed" : ""}
                  {request.status === "pending" && request.expires_at ? ` · Respond by ${formatDate(request.expires_at)}` : ""}
                </Text>
              </div>
              <Badge size="small" color={request.status === "applied" ? "green" : request.status === "rejected" ? "red" : "orange"}>
                {request.status.replace(/_/g, " ")}
              </Badge>
            </div>
            {request.email_error ? <Text size="xsmall" className="text-ui-fg-error">{request.email_error}</Text> : null}
            {request.decision_email_error ? <div className="space-y-2">
              <Text size="xsmall" className="text-ui-fg-error">Customer decision confirmation failed: {request.decision_email_error}</Text>
              <Button size="small" variant="secondary" disabled={Boolean(respondingRequestId)}
                onClick={() => void checkAdjustment(request.id, "resend_decision_email")}>Retry decision email</Button>
            </div> : null}
            {request.status === "pending" && request.email_error ? (
              <Button size="small" variant="secondary" disabled={Boolean(respondingRequestId)}
                onClick={() => void checkAdjustment(request.id, "resend_email")}>Retry customer email</Button>
            ) : null}
            {request.adjustment_amount ? <Text size="xsmall" className="text-ui-fg-muted">
              {request.adjustment_amount > 0 ? "Additional payment" : "Refund"}: {inr.format(Math.abs(request.adjustment_amount))}
            </Text> : null}
            {request.status === "pending" ? (
              <>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  After speaking with the customer, select their choice and record what they said.
                </Text>
                <div className="space-y-1.5">
                  {request.options.map((option) => (
                    <label key={option.variant_id} className="flex items-start gap-2 rounded-md border border-ui-border-base bg-ui-bg-base p-2.5 text-xs">
                      <input type="radio" name={`admin-choice-${request.id}`} value={option.variant_id}
                        checked={adminSelectedVariants[request.id] === option.variant_id}
                        onChange={() => {
                          setAdminSelectedVariants((current) => ({ ...current, [request.id]: option.variant_id || "" }))
                          setAdminConsentCodes((current) => ({ ...current, [request.id]: "" }))
                        }} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-ui-fg-base">{option.store_name || option.vendor_name || "Vendor"}</span>
                        <span className="block text-ui-fg-subtle">
                          {Object.entries(option.options || {}).map(([name, value]) => `${name}: ${value}`).join(" · ") || option.variant_title}
                        </span>
                      </span>
                      <span className="font-medium text-ui-fg-base">{inr.format(Number(option.unit_price || 0))}</span>
                    </label>
                  ))}
                </div>
                <textarea value={adminResponseNotes[request.id] || ""} maxLength={500}
                  onChange={(event) => setAdminResponseNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                  placeholder="Record what the customer explicitly agreed to, including the selected variant and price"
                  className="min-h-[64px] w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm" />
                <select value={adminContactMethods[request.id] || ""}
                  onChange={(event) => setAdminContactMethods((current) => ({ ...current, [request.id]: event.target.value }))}
                  className="w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm">
                  <option value="">Select how the customer confirmed</option>
                  <option value="phone">Phone call</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="in_person">In person</option>
                </select>
                <div className="space-y-2 rounded-md border border-ui-border-base bg-ui-bg-base p-3">
                  <Text size="xsmall" className="text-ui-fg-muted">
                    For acceptance, email a code tied to the selected option. Ask the customer to read it back only if the variant and price match their decision. The code expires in 10 minutes.
                  </Text>
                  <Button size="small" variant="secondary" disabled={Boolean(respondingRequestId) || !adminSelectedVariants[request.id]}
                    onClick={() => void sendCustomerConsentCode(request.id)}>Email confirmation code</Button>
                  {request.consent_code_sent_at ? <Text size="xsmall" className="text-ui-fg-muted">Last sent {formatDate(request.consent_code_sent_at)}</Text> : null}
                  <input value={adminConsentCodes[request.id] || ""} inputMode="numeric" maxLength={8}
                    onChange={(event) => setAdminConsentCodes((current) => ({ ...current, [request.id]: event.target.value.replace(/\D/g, "") }))}
                    placeholder="8-digit code from customer"
                    className="w-full rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-sm" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="small" isLoading={respondingRequestId === request.id}
                    disabled={Boolean(respondingRequestId) || !adminSelectedVariants[request.id] || !/^\d{8}$/.test(adminConsentCodes[request.id] || "") || !adminContactMethods[request.id] || (adminResponseNotes[request.id] || "").trim().length < 15}
                    onClick={() => void recordCustomerDecision(request.id, "accept")}>Record acceptance</Button>
                  <Button size="small" variant="secondary" disabled={Boolean(respondingRequestId) || !adminContactMethods[request.id] || (adminResponseNotes[request.id] || "").trim().length < 15}
                    onClick={() => void recordCustomerDecision(request.id, "reject")}>Record rejection</Button>
                </div>
              </>
            ) : null}
            {request.status === "settling_refund" || request.status === "awaiting_refund" ? (
              <div className="space-y-2">
                {(request.status === "awaiting_refund" || !request.razorpay_refund_id) ? (
                  <input value={refundReferences[request.id] || ""}
                    onChange={(event) => setRefundReferences((current) => ({ ...current, [request.id]: event.target.value }))}
                    placeholder={request.status === "awaiting_refund" ? "Completed manual refund reference" : "Razorpay refund ID after reconciliation"}
                    className="w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm" />
                ) : null}
                <Button size="small" variant="secondary" disabled={Boolean(respondingRequestId)}
                  onClick={() => void checkAdjustment(request.id, "check_refund")}>Check refund and assign</Button>
                {request.status === "awaiting_refund" ? (
                  <>
                    <textarea value={adminResponseNotes[request.id] || ""} maxLength={500}
                      onChange={(event) => setAdminResponseNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                      placeholder="How and when the refund was completed"
                      className="min-h-[60px] w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm" />
                    <Button size="small" variant="secondary"
                      disabled={Boolean(respondingRequestId) || (refundReferences[request.id] || "").trim().length < 5 || (adminResponseNotes[request.id] || "").trim().length < 5}
                      onClick={() => void checkAdjustment(request.id, "record_manual_refund")}>Record completed refund and assign</Button>
                  </>
                ) : null}
              </div>
            ) : null}
            {request.status === "settlement_failed" ? (
              <div className="space-y-2">
                <Text size="xsmall" className="text-ui-fg-error">Money moved, but the order edit needs review. Confirm stock and payment before retrying.</Text>
                <Button size="small" variant="secondary" disabled={Boolean(respondingRequestId)}
                  onClick={() => void checkAdjustment(request.id, "retry_assignment")}>Retry assignment</Button>
              </div>
            ) : null}
          </div>
        ))}
        {!loading && !error && vendors.length === 0 && (
          <Text size="small" className="text-ui-fg-muted">
            No vendor-linked products on this order.
          </Text>
        )}

        {vendors.map((vendor) => (
          <article
            key={vendor.vendor_id}
            className="rounded-xl bg-ui-bg-subtle/60 px-3.5 py-3.5 space-y-2.5 transition-colors duration-150 hover:bg-ui-bg-subtle"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Text size="small" weight="plus" className="truncate text-ui-fg-base">
                  {vendor.store_name || vendor.vendor_name || "Vendor"}
                </Text>
                {vendor.vendor_name && vendor.store_name ? (
                  <Text size="xsmall" className="text-ui-fg-muted truncate">
                    {vendor.vendor_name}
                  </Text>
                ) : null}
              </div>
              <Badge size="small" color={stageBadgeColor(vendor)} className="shrink-0">
                {vendor.stage === "delivered"
                  ? "Delivered"
                  : vendor.accepted
                    ? vendor.stage_label || "Accepted"
                    : vendor.acceptance_overdue ? "Overdue" : "Awaiting"}
              </Badge>
            </div>

            <div className="space-y-0.5">
              <Detail label="Status" value={vendor.acceptance_label} />
              {!vendor.accepted && vendor.acceptance_deadline_at ? (
                <Detail label="Accept by" value={formatDate(vendor.acceptance_deadline_at)} />
              ) : null}
              <Detail label="Accepted" value={formatDate(vendor.accepted_at)} />
              <Detail label="Email" value={vendor.vendor_email} />
              <Detail label="Phone" value={vendor.vendor_phone} />

              {vendor.shipping_method ? (
                <Detail
                  label="Shipping"
                  value={
                    vendor.shipping_method === "easy"
                      ? `Easy · ${
                          vendor.easy_courier_partner ||
                          (vendor.shipping_provider === "itl" ? "ITL" : "Shiprocket")
                        }`
                      : `Self · ${vendor.self_courier_partner || "Carrier"}`
                  }
                />
              ) : null}

              {(vendor.shiprocket_awb || vendor.self_awb || vendor.tracking_number) && (
                <Detail
                  label="AWB"
                  value={
                    vendor.tracking_number || vendor.shiprocket_awb || vendor.self_awb
                  }
                />
              )}

              {vendor.tracking_url ? (
                <Detail
                  label="Tracking"
                  value={
                    <a
                      href={vendor.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ui-fg-interactive hover:underline"
                    >
                      Open
                    </a>
                  }
                />
              ) : null}

              {vendor.label_url ? (
                <Detail
                  label="Label"
                  value={
                    <a
                      href={vendor.label_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ui-fg-interactive hover:underline"
                    >
                      Open
                    </a>
                  }
                />
              ) : null}

              {vendor.shiprocket_status ? (
                <Detail label="Courier" value={vendor.shiprocket_status} />
              ) : null}
              {vendor.invoice_generated_at ? (
                <Detail label="Invoice" value={formatDate(vendor.invoice_generated_at)} />
              ) : null}
              {vendor.rtd_at ? (
                <Detail label="RTD" value={formatDate(vendor.rtd_at)} />
              ) : null}
            </div>

            {vendor.items?.length > 0 ? (
              <div className="pt-2.5 border-t border-ui-border-base/70 space-y-1">
                <Text
                  size="xsmall"
                  weight="plus"
                  className="text-ui-fg-muted uppercase tracking-wider"
                >
                  Items · {vendor.item_count}
                </Text>
                {vendor.items.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-start justify-between gap-2">
                    <Text size="small" className="min-w-0 flex-1 text-ui-fg-subtle leading-snug">
                      {item.title}{item.variant_title ? ` · ${item.variant_title}` : ""}
                      {visibleSku(item.sku) ? ` · ${visibleSku(item.sku)}` : ""}{` × ${item.quantity ?? 1}`}
                    </Text>
                    {!orderCancelled && vendor.can_relocate ? (
                      <Button size="small" variant="secondary" disabled={relocationLoading}
                        onClick={() => void openRelocation(item.id)}>Shuffling</Button>
                    ) : null}
                  </div>
                ))}
                {relocatingItemId && vendor.items.some((item) => item.id === relocatingItemId) ? (
                  <div className="mt-4 overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base">
                    <div className="flex items-start justify-between gap-3 border-b border-ui-border-base px-4 py-3">
                      <div>
                        <Text size="small" weight="plus">
                          Shuffling
                        </Text>
                        <Text size="xsmall" className="mt-0.5 text-ui-fg-muted">
                          Select a vendor for the same SKU and price. The customer order stays open.
                        </Text>
                      </div>
                      <Button size="small" variant="transparent" disabled={relocationLoading}
                        onClick={() => setRelocatingItemId(null)}>Close</Button>
                    </div>
                    <div className="space-y-4 px-4 py-4">
                      <div className="rounded-md bg-ui-bg-subtle px-3 py-2.5">
                        <Text size="xsmall" className="text-ui-fg-muted">MOVING ITEM</Text>
                        <Text size="small" weight="plus" className="mt-1">
                          {vendor.items.find((item) => item.id === relocatingItemId)?.title || "Order item"}
                        </Text>
                        <Text size="xsmall" className="mt-0.5 text-ui-fg-subtle">
                          From {vendor.store_name || vendor.vendor_name || "current vendor"}
                          {replacementPrice !== null ? ` · ${inr.format(replacementPrice)} per item` : ""}
                        </Text>
                      </div>

                      {relocationLoading && !replacementOffers.length ? (
                        <Text size="small" className="text-ui-fg-muted">Checking available vendors…</Text>
                      ) : null}
                      {relocationError ? (
                        <div role="alert" className="rounded-md border border-ui-border-error bg-ui-bg-subtle px-3 py-2">
                          <Text size="small" className="text-ui-fg-error">{relocationError}</Text>
                        </div>
                      ) : null}
                      {replacementOffers.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Text size="small" weight="plus">Available vendors</Text>
                            <Text size="xsmall" className="text-ui-fg-muted">
                              {replacementOffers.length} matching {replacementOffers.length === 1 ? "vendor" : "vendors"}
                            </Text>
                          </div>
                          <div className="space-y-2" role="radiogroup" aria-label="Replacement vendor">
                            {replacementOffers.map((offer) => (
                              <button key={offer.vendor_id} type="button" role="radio"
                                aria-checked={targetVendorId === offer.vendor_id}
                                disabled={relocationLoading}
                                onClick={() => setTargetVendorId(offer.vendor_id)}
                                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ui-border-interactive ${targetVendorId === offer.vendor_id ? "border-ui-border-interactive bg-ui-bg-interactive/10" : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle"}`}>
                                <span aria-hidden="true" className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${targetVendorId === offer.vendor_id ? "border-ui-border-interactive bg-ui-bg-interactive" : "border-ui-border-strong"}`} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-ui-fg-base">
                                    {offer.store_name || offer.vendor_name || "Vendor"}
                                  </span>
                                  {offer.vendor_email ? (
                                    <span className="block truncate text-xs text-ui-fg-muted">{offer.vendor_email}</span>
                                  ) : null}
                                  <span className="mt-1 block text-xs text-ui-fg-subtle">
                                    SKU {offer.sku} · {offer.available} available
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {alternativeOffers.length > 0 ? (
                        <div className="space-y-3 border-t border-ui-border-base pt-4">
                          <div>
                            <Text size="small" weight="plus">Other available choices</Text>
                            <Text size="xsmall" className="mt-0.5 text-ui-fg-muted">
                              Different price, colour, or size requires customer approval. Select up to 10 to offer.
                            </Text>
                          </div>
                          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                            {alternativeOffers.map((offer) => {
                              const key = `${offer.variant_id}:${offer.vendor_id}:${offer.unit_price}`
                              const selected = selectedAlternatives.includes(key)
                              const details = Object.entries(offer.options || {}).map(([name, value]) => `${name}: ${value}`).join(" · ")
                              return (
                                <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${selected ? "border-ui-border-interactive bg-ui-bg-interactive/10" : "border-ui-border-base hover:bg-ui-bg-subtle"}`}>
                                  <input type="checkbox" checked={selected} disabled={relocationLoading || (!selected && selectedAlternatives.length >= 10)}
                                    className="mt-0.5 h-4 w-4 accent-green-700"
                                    onChange={() => setSelectedAlternatives((current) => selected ? current.filter((id) => id !== key) : [...current, key])} />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-ui-fg-base">{offer.store_name || offer.vendor_name || "Vendor"}</span>
                                    <span className="mt-0.5 block text-xs text-ui-fg-subtle">{details || offer.variant_title || offer.sku}</span>
                                    <span className="mt-1 block text-xs text-ui-fg-muted">SKU {offer.sku} · {offer.available} available</span>
                                  </span>
                                  <span className="shrink-0 text-sm font-semibold text-ui-fg-base">
                                    {inr.format(Number(offer.unit_price || 0))}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                          {selectedAlternatives.length > 0 ? (
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-ui-fg-subtle" htmlFor={`customer-note-${relocatingItemId}`}>
                                Note to customer (optional)
                              </label>
                              <textarea id={`customer-note-${relocatingItemId}`} value={customerNote} maxLength={500}
                                onChange={(event) => setCustomerNote(event.target.value)} disabled={relocationLoading}
                                placeholder="Explain why the original choice is unavailable"
                                className="min-h-[64px] w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm text-ui-fg-base" />
                              <Button size="small" variant="secondary" className="w-full" disabled={relocationLoading}
                                isLoading={relocationLoading} onClick={() => void requestCustomerChoice()}>
                                Send {selectedAlternatives.length} {selectedAlternatives.length === 1 ? "choice" : "choices"} to customer
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {replacementOffers.length > 0 ? (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-medium text-ui-fg-subtle" htmlFor={`reason-${relocatingItemId}`}>
                            Reason for shuffling this item
                          </label>
                          <textarea id={`reason-${relocatingItemId}`} value={relocationReason} maxLength={500}
                            onChange={(event) => setRelocationReason(event.target.value)} disabled={relocationLoading}
                            placeholder="e.g. Vendor cannot fulfill this item"
                            className="min-h-[72px] w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm text-ui-fg-base" />
                        </div>
                      ) : null}

                      {replacementOffers.length > 0 ? (
                        <Button size="small" className="w-full" onClick={() => void submitRelocation()}
                          isLoading={relocationLoading}
                          disabled={relocationLoading || !targetVendorId || relocationReason.trim().length < 3}>
                          Confirm shuffling
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderVendorAcceptanceWidget
