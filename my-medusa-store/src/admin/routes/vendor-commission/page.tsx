import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
import {
  Container,
  Heading,
  Text,
  Button,
  Input,
  toast,
  Switch,
} from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

const PAGE_SIZE = 5

const StatusDot = ({
  tone,
  children,
}: {
  tone: "green" | "orange" | "grey"
  children: React.ReactNode
}) => {
  const toneClass =
    tone === "green"
      ? { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" }
      : tone === "orange"
        ? { dot: "bg-orange-500", text: "text-orange-600 dark:text-orange-400" }
        : { dot: "bg-ui-fg-muted", text: "text-ui-fg-subtle" }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${toneClass.text}`}>
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${toneClass.dot}`} />
      {children}
    </span>
  )
}

type VendorRow = {
  id: string
  name: string
  store_name?: string | null
  email?: string
  is_approved?: boolean
  commission_override: boolean
  commission_rate: number
  effective_rate: number
  source: "global" | "custom"
  platform_fee_override: boolean
  platform_fee_rate: number
  effective_platform_rate: number
  platform_source: "global" | "custom"
  cancellation_charge_override: boolean
  cancellation_charge: number
  effective_cancellation_charge: number
  cancellation_source: "global" | "custom"
}

type DraftRow = {
  useCustom: boolean
  rate: string
  usePlatformCustom: boolean
  platformRate: string
  useCancelCustom: boolean
  cancelCharge: string
  saving: boolean
}

const RateField = ({
  label,
  unit,
  enabled,
  value,
  globalValue,
  disabled,
  onToggle,
  onChange,
  min = 0,
  max = 100,
  step = "0.1",
}: {
  label: string
  unit: string
  enabled: boolean
  value: string
  globalValue: string
  disabled?: boolean
  onToggle: (next: boolean) => void
  onChange: (next: string) => void
  min?: number
  max?: number
  step?: string
}) => (
  <div
    className={`rounded-xl border px-3 py-3 transition-colors ${
      enabled
        ? "border-ui-border-interactive bg-ui-bg-base"
        : "border-ui-border-base bg-ui-bg-subtle"
    }`}
  >
    <div className="mb-2 flex items-center justify-between gap-2">
      <Text size="small" weight="plus" className="text-ui-fg-base">
        {label}
      </Text>
      <label className="inline-flex items-center gap-2">
        <Switch
          size="small"
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(checked) => onToggle(Boolean(checked))}
        />
        <Text size="xsmall" className="text-ui-fg-muted">
          Custom
        </Text>
      </label>
    </div>
    {enabled ? (
      <div className="relative">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ui-fg-muted">
          {unit}
        </span>
      </div>
    ) : (
      <div className="flex h-10 items-center rounded-lg border border-dashed border-ui-border-base px-3">
        <Text size="small" className="text-ui-fg-subtle">
          Global · {unit === "₹" ? `₹${globalValue}` : `${globalValue}${unit}`}
        </Text>
      </div>
    )}
  </div>
)

const DefaultCard = ({
  title,
  hint,
  value,
  unit,
  disabled,
  saving,
  onChange,
  onSave,
  min = 0,
  max = 100,
  step = "0.1",
}: {
  title: string
  hint: string
  value: string
  unit: string
  disabled?: boolean
  saving?: boolean
  onChange: (v: string) => void
  onSave: () => void
  min?: number
  max?: number
  step?: string
}) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-ui-border-base bg-ui-bg-base p-4 shadow-sm">
    <div>
      <Text size="small" weight="plus">
        {title}
      </Text>
      <Text size="xsmall" className="mt-0.5 text-ui-fg-muted">
        {hint}
      </Text>
    </div>
    <div className="flex items-end gap-2">
      <div className="relative min-w-0 flex-1">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled || saving}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 pr-10 text-base font-semibold tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ui-fg-muted">
          {unit}
        </span>
      </div>
      <Button size="small" onClick={onSave} disabled={disabled || saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  </div>
)

const VendorCommissionPage = () => {
  const [defaultRate, setDefaultRate] = useState("2")
  const [defaultPlatformRate, setDefaultPlatformRate] = useState("5")
  const [defaultCancelCharge, setDefaultCancelCharge] = useState("0")
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({})
  const [baseline, setBaseline] = useState<Record<string, DraftRow>>({})
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPlatform, setSavingPlatform] = useState(false)
  const [savingCancel, setSavingCancel] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/admin/vendor-commission", { credentials: "include" })
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()
      const list: VendorRow[] = data.vendors || []
      setDefaultRate(String(data.default_rate ?? 2))
      setDefaultPlatformRate(String(data.default_platform_rate ?? 5))
      setDefaultCancelCharge(String(data.default_cancellation_charge ?? 0))
      setVendors(list)
      const nextDrafts: Record<string, DraftRow> = {}
      for (const v of list) {
        nextDrafts[v.id] = {
          useCustom: v.commission_override,
          rate: String(v.commission_rate ?? data.default_rate ?? 2),
          usePlatformCustom: v.platform_fee_override,
          platformRate: String(v.platform_fee_rate ?? data.default_platform_rate ?? 5),
          useCancelCustom: v.cancellation_charge_override,
          cancelCharge: String(v.cancellation_charge ?? data.default_cancellation_charge ?? 0),
          saving: false,
        }
      }
      setDrafts(nextDrafts)
      setBaseline(nextDrafts)
    } catch {
      toast.error("Failed to load commission settings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vendors
    return vendors.filter((v) => {
      const hay = `${v.store_name || ""} ${v.name || ""} ${v.email || ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [vendors, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const paged = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, safePage])

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const customCount = useMemo(
    () =>
      vendors.filter(
        (v) =>
          v.commission_override ||
          v.platform_fee_override ||
          v.cancellation_charge_override
      ).length,
    [vendors]
  )

  const isDirty = (vendorId: string) => {
    const d = drafts[vendorId]
    const b = baseline[vendorId]
    if (!d || !b) return false
    return (
      d.useCustom !== b.useCustom ||
      d.rate !== b.rate ||
      d.usePlatformCustom !== b.usePlatformCustom ||
      d.platformRate !== b.platformRate ||
      d.useCancelCustom !== b.useCancelCustom ||
      d.cancelCharge !== b.cancelCharge
    )
  }

  const saveDefault = async () => {
    const n = Number(defaultRate)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("Enter a commission rate between 0 and 100")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/admin/vendor-commission", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ default_rate: n }),
      })
      if (!res.ok) throw new Error("Save failed")
      const data = await res.json()
      setDefaultRate(String(data.default_rate))
      toast.success("Default commission saved")
      await load()
    } catch {
      toast.error("Could not save default commission")
    } finally {
      setSaving(false)
    }
  }

  const saveDefaultPlatform = async () => {
    const n = Number(defaultPlatformRate)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("Enter a platform fee between 0 and 100")
      return
    }
    setSavingPlatform(true)
    try {
      const res = await fetch("/admin/vendor-commission", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ default_platform_rate: n }),
      })
      if (!res.ok) throw new Error("Save failed")
      const data = await res.json()
      setDefaultPlatformRate(String(data.default_platform_rate))
      toast.success("Default platform fee saved")
      await load()
    } catch {
      toast.error("Could not save default platform fee")
    } finally {
      setSavingPlatform(false)
    }
  }

  const saveDefaultCancel = async () => {
    const n = Number(defaultCancelCharge)
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      toast.error("Enter a cancellation charge between ₹0 and ₹1,00,000")
      return
    }
    setSavingCancel(true)
    try {
      const res = await fetch("/admin/vendor-commission", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ default_cancellation_charge: n }),
      })
      if (!res.ok) throw new Error("Save failed")
      const data = await res.json()
      setDefaultCancelCharge(String(data.default_cancellation_charge))
      toast.success("Default cancellation charge saved")
      await load()
    } catch {
      toast.error("Could not save default cancellation charge")
    } finally {
      setSavingCancel(false)
    }
  }

  const saveVendor = async (vendorId: string) => {
    const draft = drafts[vendorId]
    if (!draft) return

    if (draft.useCustom) {
      const n = Number(draft.rate)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        toast.error("Custom commission must be between 0 and 100")
        return
      }
    }
    if (draft.usePlatformCustom) {
      const n = Number(draft.platformRate)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        toast.error("Custom platform fee must be between 0 and 100")
        return
      }
    }
    if (draft.useCancelCustom) {
      const n = Number(draft.cancelCharge)
      if (!Number.isFinite(n) || n < 0 || n > 100000) {
        toast.error("Custom cancellation charge must be ₹0–₹1,00,000")
        return
      }
    }

    setDrafts((prev) => ({
      ...prev,
      [vendorId]: { ...prev[vendorId], saving: true },
    }))

    try {
      const body: {
        commission_override: boolean
        commission_rate?: number
        platform_fee_override: boolean
        platform_fee_rate?: number
        cancellation_charge_override: boolean
        cancellation_charge?: number
      } = {
        commission_override: draft.useCustom,
        platform_fee_override: draft.usePlatformCustom,
        cancellation_charge_override: draft.useCancelCustom,
      }
      if (draft.useCustom) body.commission_rate = Number(draft.rate)
      if (draft.usePlatformCustom) body.platform_fee_rate = Number(draft.platformRate)
      if (draft.useCancelCustom) body.cancellation_charge = Number(draft.cancelCharge)

      const res = await fetch(`/admin/vendors/${vendorId}/commission`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || "Save failed")
      }

      toast.success("Vendor rates saved")
      await load()
    } catch (e: any) {
      toast.error(e?.message || "Could not save vendor rates")
      setDrafts((prev) => ({
        ...prev,
        [vendorId]: { ...prev[vendorId], saving: false },
      }))
    }
  }

  const updateDraft = (vendorId: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => ({
      ...prev,
      [vendorId]: { ...prev[vendorId], ...patch },
    }))
  }

  const resetVendor = (vendorId: string) => {
    const b = baseline[vendorId]
    if (!b) return
    setDrafts((prev) => ({ ...prev, [vendorId]: { ...b, saving: false } }))
  }

  return (
    <Container className="p-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        <header className="flex flex-col gap-4 border-b border-ui-border-base pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <Heading level="h1" className="text-2xl">
              Vendor Commission
            </Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Changes apply to new orders only. In-progress, delivered, cancelled, and returned orders keep their original rates.
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <StatusDot tone="grey">{vendors.length} vendors</StatusDot>
            <StatusDot tone={customCount ? "orange" : "green"}>
              {customCount} custom offer{customCount === 1 ? "" : "s"}
            </StatusDot>
          </div>
        </header>

        <section className="space-y-3">
          <div>
            <Heading level="h2" className="text-base">
              Global defaults
            </Heading>
            <Text size="xsmall" className="text-ui-fg-muted">
              Used when a vendor has no custom offer. Cancellation amount gets 18% GST in the ledger.
            </Text>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <DefaultCard
              title="Commission"
              hint="Marketplace cut on sales"
              value={defaultRate}
              unit="%"
              disabled={loading}
              saving={saving}
              onChange={setDefaultRate}
              onSave={() => void saveDefault()}
            />
            <DefaultCard
              title="Platform fee"
              hint="Sheet4 platform fee (D)"
              value={defaultPlatformRate}
              unit="%"
              disabled={loading}
              saving={savingPlatform}
              onChange={setDefaultPlatformRate}
              onSave={() => void saveDefaultPlatform()}
            />
            <DefaultCard
              title="Cancellation charge"
              hint="Fixed rupees per cancelled order"
              value={defaultCancelCharge}
              unit="₹"
              min={0}
              max={100000}
              step="1"
              disabled={loading}
              saving={savingCancel}
              onChange={setDefaultCancelCharge}
              onSave={() => void saveDefaultCancel()}
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Heading level="h2" className="text-base">
                Vendors
              </Heading>
              <Text size="xsmall" className="text-ui-fg-muted">
                Edit rates per store. Save only appears when something changes.
              </Text>
            </div>
            <div className="w-full sm:w-72">
              <Input
                placeholder="Search store, name, email…"
                value={search}
                disabled={loading}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-36 animate-pulse rounded-2xl border border-ui-border-base bg-ui-bg-subtle"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ui-border-base px-6 py-12 text-center">
              <Text weight="plus">No vendors found</Text>
              <Text size="small" className="mt-1 text-ui-fg-muted">
                Try another search, or clear the filter.
              </Text>
            </div>
          ) : (
            <>
            <div className="grid gap-3">
              {paged.map((v) => {
                const draft = drafts[v.id] || {
                  useCustom: false,
                  rate: defaultRate,
                  usePlatformCustom: false,
                  platformRate: defaultPlatformRate,
                  useCancelCustom: false,
                  cancelCharge: defaultCancelCharge,
                  saving: false,
                }
                const dirty = isDirty(v.id)
                const title = v.store_name || v.name || "Vendor"
                const hasAnyCustom =
                  draft.useCustom || draft.usePlatformCustom || draft.useCancelCustom

                return (
                  <article
                    key={v.id}
                    className={`rounded-2xl border bg-ui-bg-base p-4 shadow-sm transition-colors md:p-5 ${
                      dirty
                        ? "border-ui-border-interactive"
                        : "border-ui-border-base"
                    }`}
                  >
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <Text weight="plus" className="truncate text-base">
                            {title}
                          </Text>
                          <StatusDot tone={v.is_approved ? "green" : "grey"}>
                            {v.is_approved ? "Approved" : "Other"}
                          </StatusDot>
                          {hasAnyCustom ? (
                            <StatusDot tone="orange">Custom offer</StatusDot>
                          ) : null}
                        </div>
                        {v.email ? (
                          <Text size="small" className="mt-0.5 truncate text-ui-fg-muted">
                            {v.email}
                          </Text>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {dirty ? (
                          <Button
                            size="small"
                            variant="secondary"
                            disabled={draft.saving}
                            onClick={() => resetVendor(v.id)}
                          >
                            Reset
                          </Button>
                        ) : null}
                        <Button
                          size="small"
                          disabled={!dirty || draft.saving}
                          onClick={() => void saveVendor(v.id)}
                        >
                          {draft.saving ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <RateField
                        label="Commission"
                        unit="%"
                        enabled={draft.useCustom}
                        value={draft.rate}
                        globalValue={defaultRate}
                        disabled={draft.saving}
                        onToggle={(next) => updateDraft(v.id, { useCustom: next })}
                        onChange={(next) => updateDraft(v.id, { rate: next })}
                      />
                      <RateField
                        label="Platform fee"
                        unit="%"
                        enabled={draft.usePlatformCustom}
                        value={draft.platformRate}
                        globalValue={defaultPlatformRate}
                        disabled={draft.saving}
                        onToggle={(next) => updateDraft(v.id, { usePlatformCustom: next })}
                        onChange={(next) => updateDraft(v.id, { platformRate: next })}
                      />
                      <RateField
                        label="Cancel charge"
                        unit="₹"
                        enabled={draft.useCancelCustom}
                        value={draft.cancelCharge}
                        globalValue={defaultCancelCharge}
                        disabled={draft.saving}
                        min={0}
                        max={100000}
                        step="1"
                        onToggle={(next) => updateDraft(v.id, { useCancelCustom: next })}
                        onChange={(next) => updateDraft(v.id, { cancelCharge: next })}
                      />
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="flex flex-col gap-3 border-t border-ui-border-base pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Text size="small" className="text-ui-fg-muted">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </Text>
              <div className="flex items-center gap-2">
                <Button
                  size="small"
                  variant="secondary"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Text size="small" className="min-w-[4.5rem] text-center tabular-nums text-ui-fg-subtle">
                  {safePage} / {pageCount}
                </Text>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
            </>
          )}
        </section>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vendor Commission",
  icon: CurrencyDollar,
})

export default VendorCommissionPage
