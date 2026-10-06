import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Heading, Text, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState, type ReactNode } from "react"

type OrderRecord = {
  id?: string
  status?: string
  fulfillment_status?: string
  metadata?: Record<string, unknown> | null
}

type CancelPayoutDetails = {
  method?: string | null
  upi_id?: string
  account_name?: string
  account_number?: string
  ifsc_code?: string
  bank_name?: string
}

type CancelPayoutResponse = {
  method: string | null
  upi_masked: string | null
  bank_last4: string | null
  details: CancelPayoutDetails | null
}

type AdminCancelInfo = {
  can_cancel: boolean
  awaiting_vendor?: boolean
  cancellation?: {
    is_cancelled: boolean
    source: "admin" | "customer" | null
    note: string | null
    customer_reason: string | null
    vendor_message: string | null
    cancelled_at: string | null
    cancelled_by_label: string
  }
}

function extractOrder(data: unknown): OrderRecord | null {
  if (!data || typeof data !== "object") return null
  const root = data as Record<string, unknown>
  if (root.order && typeof root.order === "object") return root.order as OrderRecord
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>
    if (nested.order && typeof nested.order === "object") return nested.order as OrderRecord
  }
  return root as OrderRecord
}

function getOrderIdFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  const index = parts.indexOf("orders")
  if (index === -1) return null
  return parts[index + 1] || null
}

function formatDate(value: string | null) {
  if (!value) return "Not available"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function readMetaText(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

const InfoRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex items-start justify-between gap-3 py-2">
    <Text size="small" className="text-ui-fg-muted shrink-0">
      {label}
    </Text>
    <Text
      size="small"
      weight="plus"
      className="max-w-[62%] text-right whitespace-pre-wrap text-ui-fg-base"
    >
      {value}
    </Text>
  </div>
)

const MessageField = ({
  title,
  hint,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  title: string
  hint: string
  value: string
  onChange: (next: string) => void
  disabled: boolean
  placeholder: string
}) => (
  <div className="flex flex-col gap-1.5">
    <Text size="small" weight="plus" className="text-ui-fg-base">
      {title}
    </Text>
    <Text size="xsmall" className="text-ui-fg-muted leading-relaxed">
      {hint}
    </Text>
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      maxLength={500}
      rows={3}
      placeholder={placeholder}
      className="mt-1 w-full resize-y rounded-lg border border-ui-border-base bg-ui-bg-field px-3 py-2.5 text-sm text-ui-fg-base placeholder:text-ui-fg-muted outline-none transition-[border-color,box-shadow] duration-150 focus:border-ui-border-interactive focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] disabled:opacity-60"
    />
    <Text size="xsmall" className="text-ui-fg-disabled self-end tabular-nums">
      {value.trim().length}/500
    </Text>
  </div>
)

const OrderCancellationSummaryWidget = () => {
  const [order, setOrder] = useState<OrderRecord | null>(null)
  const [cancelPayout, setCancelPayout] = useState<CancelPayoutResponse | null>(null)
  const [adminCancel, setAdminCancel] = useState<AdminCancelInfo | null>(null)
  const [customerReason, setCustomerReason] = useState("")
  const [vendorMessage, setVendorMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<"idle" | "cancel" | "customer" | "vendor">("idle")

  const orderId = useMemo(() => {
    if (typeof window === "undefined") return null
    return getOrderIdFromPath(window.location.pathname)
  }, [])

  const load = async () => {
    if (!orderId) return
    setLoading(true)
    try {
      const [orderRes, cancelRes] = await Promise.all([
        fetch(`/admin/orders/${orderId}`, { credentials: "include" }),
        fetch(`/admin/orders/${orderId}/admin-cancel`, { credentials: "include" }),
      ])
      if (orderRes.ok) {
        const data = await orderRes.json()
        const nextOrder = extractOrder(data)
        setOrder(nextOrder)

        const meta = (nextOrder?.metadata || {}) as Record<string, unknown>
        const hasPayout =
          typeof meta.cancel_refund_payout_encrypted === "string" ||
          typeof meta.cancel_refund_method === "string"
        if (hasPayout) {
          const payoutRes = await fetch(`/admin/orders/${orderId}/cancel-payout`, {
            credentials: "include",
          })
          if (payoutRes.ok) {
            const payoutData = await payoutRes.json()
            setCancelPayout(payoutData?.cancel_payout || null)
          }
        } else {
          setCancelPayout(null)
        }
      }
      if (cancelRes.ok) {
        const cancelData = (await cancelRes.json()) as AdminCancelInfo
        setAdminCancel(cancelData)
        const savedCustomer = cancelData.cancellation?.customer_reason
        const savedVendor = cancelData.cancellation?.vendor_message
        if (savedCustomer) setCustomerReason(savedCustomer)
        if (savedVendor) setVendorMessage(savedVendor)
      }
    } catch {
      // Keep order page stable if widget fetch fails.
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [orderId])

  const metadata = (order?.metadata || {}) as Record<string, unknown>
  const status = (order?.status || "").toLowerCase()
  const isCanceled = status === "canceled" || status === "cancelled"
  const cancellation = adminCancel?.cancellation
  const source =
    cancellation?.source ||
    (metadata.cancelled_by_admin === true || metadata.cancellation_source === "admin"
      ? "admin"
      : isCanceled
        ? "customer"
        : null)
  const savedCustomerReason =
    cancellation?.customer_reason ||
    readMetaText(metadata, "customer_cancel_reason", "cancellation_reason")
  const savedVendorMessage =
    cancellation?.vendor_message ||
    readMetaText(metadata, "vendor_cancel_message", "admin_cancel_note")
  const requestedAt =
    cancellation?.cancelled_at ||
    (typeof metadata.cancellation_requested_at === "string"
      ? metadata.cancellation_requested_at
      : null)
  const requestedBy =
    typeof metadata.cancellation_requested_by === "string"
      ? metadata.cancellation_requested_by
      : null
  const shiprocketStatus =
    typeof metadata.shiprocket_status === "string" ? metadata.shiprocket_status : null
  const payoutMethod =
    cancelPayout?.method ||
    (typeof metadata.cancel_refund_method === "string" ? metadata.cancel_refund_method : null)
  const canCancel = Boolean(adminCancel?.can_cancel) && !isCanceled
  const hasCancelContext =
    isCanceled || Boolean(savedCustomerReason) || Boolean(payoutMethod) || canCancel
  const busy = saving !== "idle"

  const parseError = (data: Record<string, unknown>, fallback: string) =>
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.error === "string" && data.error) ||
    fallback

  const cancelOrder = async () => {
    if (!orderId) return
    const nextCustomer = customerReason.trim()
    const nextVendor = vendorMessage.trim()
    if (nextCustomer.length < 3) {
      toast.error("Write the reason to send to the customer")
      return
    }
    if (nextVendor.length < 3) {
      toast.error("Write the message for the vendor")
      return
    }
    setSaving("cancel")
    try {
      const res = await fetch(`/admin/orders/${orderId}/admin-cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer_reason: nextCustomer,
          vendor_message: nextVendor,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(parseError(data, "Could not cancel order"))
      toast.success("Order cancelled. Customer reason emailed.")
      await load()
    } catch (error: any) {
      toast.error(error?.message || "Could not cancel order")
    } finally {
      setSaving("idle")
    }
  }

  const sendAudience = async (audience: "customer" | "vendor") => {
    if (!orderId) return
    const nextCustomer = customerReason.trim()
    const nextVendor = vendorMessage.trim()
    if (audience === "customer" && nextCustomer.length < 3) {
      toast.error("Write the reason to send to the customer")
      return
    }
    if (audience === "vendor" && nextVendor.length < 3) {
      toast.error("Write the message for the vendor")
      return
    }
    setSaving(audience)
    try {
      const res = await fetch(`/admin/orders/${orderId}/admin-cancel`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          audience === "customer"
            ? { customer_reason: nextCustomer, send_customer: true }
            : { vendor_message: nextVendor, send_vendor: true }
        ),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(parseError(data, "Could not send message"))
      toast.success(
        audience === "customer"
          ? "Customer reason saved and emailed"
          : "Vendor message saved and emailed"
      )
      await load()
    } catch (error: any) {
      toast.error(error?.message || "Could not send message")
    } finally {
      setSaving("idle")
    }
  }

  if (!loading && !hasCancelContext) {
    return null
  }

  return (
    <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-xl border border-ui-border-base overflow-hidden transition-shadow duration-200 hover:shadow-elevation-card-hover">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ui-border-base">
        <div className="min-w-0">
          <Heading level="h2" className="text-ui-fg-base">
            {isCanceled ? "Cancelled" : "Cancellation"}
          </Heading>
          <Text size="small" className="text-ui-fg-muted mt-0.5 leading-relaxed">
            {isCanceled
              ? source === "admin"
                ? "Send a customer reason and a separate vendor note."
                : "Customer cancelled from the storefront."
              : "Cancel only if the vendor has not accepted yet."}
          </Text>
        </div>
        <Badge
          size="small"
          color={isCanceled ? "red" : "orange"}
          className="shrink-0"
        >
          {isCanceled ? (source === "admin" ? "Admin" : "Customer") : "Open"}
        </Badge>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <Text size="small" className="text-ui-fg-muted">
            Loading…
          </Text>
        ) : (
          <div className="flex flex-col gap-5">
            {isCanceled ? (
              <div className="rounded-lg bg-ui-bg-subtle px-3.5 py-3 space-y-0.5">
                <InfoRow
                  label="Cancelled by"
                  value={source === "admin" ? "Admin" : "Customer"}
                />
                <InfoRow label="When" value={formatDate(requestedAt)} />
                {source !== "admin" && requestedBy ? (
                  <InfoRow label="Customer ID" value={requestedBy} />
                ) : null}
                {savedCustomerReason ? (
                  <InfoRow label="Customer reason" value={savedCustomerReason} />
                ) : null}
                {savedVendorMessage ? (
                  <InfoRow label="Vendor note" value={savedVendorMessage} />
                ) : null}
                {shiprocketStatus ? (
                  <InfoRow label="Courier status" value={shiprocketStatus} />
                ) : null}
                {payoutMethod ? (
                  <>
                    <InfoRow
                      label="Refund via"
                      value={
                        payoutMethod === "upi"
                          ? "UPI"
                          : payoutMethod === "bank"
                            ? "Bank transfer"
                            : payoutMethod
                      }
                    />
                    {payoutMethod === "upi" ? (
                      <InfoRow
                        label="UPI"
                        value={
                          cancelPayout?.details?.upi_id ||
                          cancelPayout?.upi_masked ||
                          (typeof metadata.cancel_upi_masked === "string"
                            ? metadata.cancel_upi_masked
                            : "Unavailable")
                        }
                      />
                    ) : null}
                    {payoutMethod === "bank" ? (
                      <>
                        <InfoRow
                          label="Account"
                          value={cancelPayout?.details?.account_name || "Unavailable"}
                        />
                        <InfoRow
                          label="Number"
                          value={
                            cancelPayout?.details?.account_number ||
                            (cancelPayout?.bank_last4
                              ? `****${cancelPayout.bank_last4}`
                              : typeof metadata.cancel_bank_last4 === "string"
                                ? `****${metadata.cancel_bank_last4}`
                                : "Unavailable")
                          }
                        />
                        <InfoRow
                          label="IFSC"
                          value={cancelPayout?.details?.ifsc_code || "Unavailable"}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            <MessageField
              title="Reason for customer"
              hint="Emailed to the customer and shown on their order page."
              value={customerReason}
              onChange={setCustomerReason}
              disabled={busy}
              placeholder="e.g. Vendor did not accept in time — you will receive a refund if you paid."
            />
            {isCanceled ? (
              <Button
                size="small"
                className="self-start"
                disabled={busy || customerReason.trim().length < 3}
                isLoading={saving === "customer"}
                onClick={() => void sendAudience("customer")}
              >
                {saving === "customer" ? "Sending…" : "Email customer"}
              </Button>
            ) : null}

            <MessageField
              title="Note for vendor"
              hint="Vendor portal only — the customer never sees this."
              value={vendorMessage}
              onChange={setVendorMessage}
              disabled={busy}
              placeholder="e.g. Order closed — do not pack or ship."
            />
            {isCanceled ? (
              <Button
                size="small"
                variant="secondary"
                className="self-start"
                disabled={busy || vendorMessage.trim().length < 3}
                isLoading={saving === "vendor"}
                onClick={() => void sendAudience("vendor")}
              >
                {saving === "vendor" ? "Saving…" : "Save vendor note"}
              </Button>
            ) : (
              <Button
                size="small"
                variant="danger"
                className="self-start"
                disabled={
                  busy ||
                  customerReason.trim().length < 3 ||
                  vendorMessage.trim().length < 3
                }
                isLoading={saving === "cancel"}
                onClick={() => void cancelOrder()}
              >
                {saving === "cancel" ? "Cancelling…" : "Cancel order"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderCancellationSummaryWidget
