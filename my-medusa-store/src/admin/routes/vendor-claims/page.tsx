import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Label,
  Select,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

type VendorReport = {
  id: string
  vendor_id: string
  vendor_name?: string | null
  vendor_email?: string | null
  order_id: string
  order_display_id?: string | null
  return_request_id?: string | null
  source: string
  issue_title: string
  issue_description: string
  product_snapshot?: Array<{
    id?: string
    title?: string
    quantity?: number
    unit_price?: number
  }> | null
  order_snapshot?: Record<string, any> | null
  image_urls?: string[] | null
  status: string
  admin_notes?: string | null
  approved_amount?: number | null
  created_at?: string
  updated_at?: string
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_review", label: "In review" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
]

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)

const statusColor = (status: string) => {
  switch (status) {
    case "open":
      return "orange"
    case "in_review":
      return "blue"
    case "resolved":
      return "green"
    case "closed":
      return "grey"
    default:
      return "grey"
  }
}

const formatDate = (value?: string) => {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const VendorReportsAdminPage = () => {
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState<VendorReport[]>([])
  const [error, setError] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [draftStatus, setDraftStatus] = useState("open")
  const [draftNotes, setDraftNotes] = useState("")
  const [draftAmount, setDraftAmount] = useState("")
  const [saving, setSaving] = useState(false)

  const loadReports = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/admin/vendor-reports", { credentials: "include" })
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status}`)
      }
      const data = await res.json()
      const list: VendorReport[] = data?.reports || []
      setReports(list)
      if (selectedId && !list.some((r) => r.id === selectedId)) {
        setSelectedId(null)
      }
    } catch (e: any) {
      const msg = e?.message || "Failed to load vendor claims"
      setError(msg)
      toast.error("Error", { description: msg })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    if (statusFilter === "all") return reports
    return reports.filter((r) => r.status === statusFilter)
  }, [reports, statusFilter])

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) || null,
    [reports, selectedId]
  )

  useEffect(() => {
    if (!selected) return
    setDraftStatus(selected.status || "open")
    setDraftNotes(selected.admin_notes || "")
    setDraftAmount(
      selected.approved_amount != null && Number(selected.approved_amount) > 0
        ? String(selected.approved_amount)
        : ""
    )
  }, [selected])

  const saveStatus = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const amountTrim = draftAmount.trim()
      const approvedAmount =
        amountTrim === "" ? null : Number(amountTrim)
      if (amountTrim !== "" && (!Number.isFinite(approvedAmount) || (approvedAmount as number) < 0)) {
        throw new Error("Enter a valid claim amount (₹)")
      }
      if (
        (draftStatus === "resolved" || draftStatus === "closed") &&
        approvedAmount != null &&
        approvedAmount > 0
      ) {
        // approved with payout
      }

      const res = await fetch(`/admin/vendor-reports/${selected.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: draftStatus,
          admin_notes: draftNotes || null,
          approved_amount: approvedAmount,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.message || `Update failed: ${res.status}`)
      }
      const data = await res.json().catch(() => ({}))
      const credited = data?.claim_credit?.credited
      toast.success("Updated", {
        description: credited
          ? `Claim saved · ₹${Number(data.claim_credit.net_amount).toFixed(2)} added to vendor pending payment`
          : "Claim status saved",
      })
      await loadReports()
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed to update" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h1" className="mb-1 text-2xl font-semibold">
            Vendor Claims
          </Heading>
          <Text className="text-ui-fg-subtle">
            Claims raised by vendors for lost / wrong return items and order problems
          </Text>
        </div>
        <Button variant="secondary" onClick={() => void loadReports()} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          <Text className="text-sm font-medium">{error}</Text>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Label>Status</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <Select.Trigger className="w-44">
            <Select.Value placeholder="Filter" />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all">All</Select.Item>
            {STATUS_OPTIONS.map((opt) => (
              <Select.Item key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <Text className="text-sm text-ui-fg-subtle">{filtered.length} claims</Text>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          {loading ? (
            <Text className="text-ui-fg-subtle">Loading claims…</Text>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-ui-border-base p-6">
              <Text className="text-ui-fg-subtle">No vendor claims yet.</Text>
            </div>
          ) : (
            filtered.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setSelectedId(report.id)}
                className={`w-full rounded-lg border p-4 text-left transition ${
                  selectedId === report.id
                    ? "border-ui-border-interactive bg-ui-bg-base"
                    : "border-ui-border-base hover:bg-ui-bg-subtle"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Text className="font-medium">{report.issue_title}</Text>
                    <Text className="text-sm text-ui-fg-subtle">
                      {report.vendor_name || report.vendor_id} · Order #
                      {report.order_display_id || report.order_id.slice(-6)}
                    </Text>
                    {report.approved_amount != null && Number(report.approved_amount) > 0 ? (
                      <Text className="text-sm font-medium text-emerald-600">
                        Claim {formatCurrency(Number(report.approved_amount))}
                      </Text>
                    ) : null}
                  </div>
                  <Badge color={statusColor(report.status) as any}>
                    {(report.status || "open").replace(/_/g, " ")}
                  </Badge>
                </div>
                <Text className="line-clamp-2 text-sm">{report.issue_description}</Text>
                <Text className="mt-2 text-xs text-ui-fg-muted">
                  {formatDate(report.created_at)} · source {report.source}
                </Text>
              </button>
            ))
          )}
        </div>

        <div className="rounded-lg border border-ui-border-base p-5">
          {!selected ? (
            <Text className="text-ui-fg-subtle">Select a claim to view details</Text>
          ) : (
            <div className="space-y-4">
              <div>
                <Heading level="h2" className="text-lg">
                  {selected.issue_title}
                </Heading>
                <Text className="text-sm text-ui-fg-subtle">
                  {selected.vendor_name || "Vendor"} ({selected.vendor_email || selected.vendor_id})
                </Text>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-ui-fg-subtle">Order: </span>#
                  {selected.order_display_id || selected.order_id}
                </div>
                <div>
                  <span className="text-ui-fg-subtle">Source: </span>
                  {selected.source}
                </div>
                <div>
                  <span className="text-ui-fg-subtle">Created: </span>
                  {formatDate(selected.created_at)}
                </div>
                {selected.return_request_id && (
                  <div>
                    <span className="text-ui-fg-subtle">Return: </span>
                    {selected.return_request_id}
                  </div>
                )}
              </div>

              <div>
                <Text className="mb-1 text-sm font-medium">Issue details</Text>
                <Text className="whitespace-pre-wrap text-sm">{selected.issue_description}</Text>
              </div>

              {!!selected.product_snapshot?.length && (
                <div>
                  <Text className="mb-1 text-sm font-medium">Products</Text>
                  <ul className="space-y-1 text-sm">
                    {selected.product_snapshot.map((p, i) => (
                      <li key={p.id || i}>
                        {p.title || "Item"} × {p.quantity ?? "—"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!!selected.image_urls?.length && (
                <div>
                  <Text className="mb-2 text-sm font-medium">Images</Text>
                  <div className="flex flex-wrap gap-2">
                    {selected.image_urls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-20 w-20 overflow-hidden rounded border border-ui-border-base"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2 border-t border-ui-border-base pt-4">
                <Label>Status</Label>
                <Select value={draftStatus} onValueChange={setDraftStatus}>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {STATUS_OPTIONS.map((opt) => (
                      <Select.Item key={opt.value} value={opt.value}>
                        {opt.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>

                <Label>Approved claim amount (₹)</Label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draftAmount}
                  onChange={(e) => setDraftAmount(e.target.value)}
                  placeholder="e.g. half product value"
                  className="h-10 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm outline-none focus:border-ui-border-interactive"
                />
                <Text className="text-xs text-ui-fg-muted">
                  On Resolved / Closed with amount &gt; 0, this is added to the vendor’s Pending
                  Payment (Vendor Payouts) and shown on their Claims &amp; Payments ledger.
                </Text>

                <Label>Admin notes</Label>
                <Textarea
                  rows={4}
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="Internal notes for this ticket…"
                />
                <Button isLoading={saving} onClick={() => void saveStatus()}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vendor Claims",
  icon: DocumentText,
})

export default VendorReportsAdminPage
