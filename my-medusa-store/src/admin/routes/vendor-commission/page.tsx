import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
import { Container, Heading, Text, Button, Input, Label, toast, Badge } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

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
}

type DraftRow = {
  useCustom: boolean
  rate: string
  usePlatformCustom: boolean
  platformRate: string
  saving: boolean
}

const VendorCommissionPage = () => {
  const [defaultRate, setDefaultRate] = useState("2")
  const [defaultPlatformRate, setDefaultPlatformRate] = useState("5")
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({})
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPlatform, setSavingPlatform] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/admin/vendor-commission", { credentials: "include" })
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()
      const list: VendorRow[] = data.vendors || []
      setDefaultRate(String(data.default_rate ?? 2))
      setDefaultPlatformRate(String(data.default_platform_rate ?? 5))
      setVendors(list)
      const nextDrafts: Record<string, DraftRow> = {}
      for (const v of list) {
        nextDrafts[v.id] = {
          useCustom: v.commission_override,
          rate: String(v.commission_rate ?? data.default_rate ?? 2),
          usePlatformCustom: v.platform_fee_override,
          platformRate: String(v.platform_fee_rate ?? data.default_platform_rate ?? 5),
          saving: false,
        }
      }
      setDrafts(nextDrafts)
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
      } = {
        commission_override: draft.useCustom,
        platform_fee_override: draft.usePlatformCustom,
      }
      if (draft.useCustom) body.commission_rate = Number(draft.rate)
      if (draft.usePlatformCustom) body.platform_fee_rate = Number(draft.platformRate)

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

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-6 px-6 py-6">
        <div>
          <Heading level="h1">Vendor Commission</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Set global defaults, or give a vendor a custom commission / platform-fee offer.
          </Text>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-ui-border-base p-4 flex flex-col gap-3">
            <Label>Default commission (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={defaultRate}
              disabled={loading || saving}
              onChange={(e) => setDefaultRate(e.target.value)}
            />
            <Text size="small" className="text-ui-fg-subtle">
              Used when a vendor does not have a custom commission.
            </Text>
            <Button onClick={saveDefault} disabled={loading || saving}>
              {saving ? "Saving…" : "Save default"}
            </Button>
          </div>

          <div className="rounded-lg border border-ui-border-base p-4 flex flex-col gap-3">
            <Label>Default platform fee (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={defaultPlatformRate}
              disabled={loading || savingPlatform}
              onChange={(e) => setDefaultPlatformRate(e.target.value)}
            />
            <Text size="small" className="text-ui-fg-subtle">
              Sheet4 platform fee (D). New vendors inherit this unless you mark Custom.
            </Text>
            <Button onClick={saveDefaultPlatform} disabled={loading || savingPlatform}>
              {savingPlatform ? "Saving…" : "Save platform default"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Heading level="h2">Vendors</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                Custom commission or platform fee is an offer — uncheck Custom to return to the global default.
              </Text>
            </div>
            <div className="w-full sm:w-64">
              <Input
                placeholder="Search vendor…"
                value={search}
                disabled={loading}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <Text size="small" className="text-ui-fg-subtle">
              Loading vendors…
            </Text>
          ) : filtered.length === 0 ? (
            <Text size="small" className="text-ui-fg-subtle">
              No vendors found.
            </Text>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-ui-border-base">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-ui-bg-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Vendor</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Custom commission</th>
                    <th className="px-3 py-2 text-left font-medium">Commission %</th>
                    <th className="px-3 py-2 text-left font-medium">Effective</th>
                    <th className="px-3 py-2 text-left font-medium">Custom platform</th>
                    <th className="px-3 py-2 text-left font-medium">Platform %</th>
                    <th className="px-3 py-2 text-left font-medium">Effective</th>
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => {
                    const draft = drafts[v.id] || {
                      useCustom: false,
                      rate: defaultRate,
                      usePlatformCustom: false,
                      platformRate: defaultPlatformRate,
                      saving: false,
                    }
                    return (
                      <tr key={v.id} className="border-t border-ui-border-base">
                        <td className="px-3 py-3">
                          <div className="font-medium">{v.store_name || v.name}</div>
                          <div className="text-ui-fg-subtle text-xs">{v.email}</div>
                        </td>
                        <td className="px-3 py-3">
                          <Badge color={v.is_approved ? "green" : "orange"}>
                            {v.is_approved ? "Approved" : "Other"}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draft.useCustom}
                              disabled={draft.saving}
                              onChange={(e) =>
                                updateDraft(v.id, { useCustom: e.target.checked })
                              }
                            />
                            <span>Custom</span>
                          </label>
                        </td>
                        <td className="px-3 py-3">
                          {draft.useCustom ? (
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              className="w-24"
                              value={draft.rate}
                              disabled={draft.saving}
                              onChange={(e) => updateDraft(v.id, { rate: e.target.value })}
                            />
                          ) : (
                            <Text size="small" className="text-ui-fg-subtle">
                              Global ({defaultRate}%)
                            </Text>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge color={v.source === "custom" ? "orange" : "grey"}>
                            {v.effective_rate}% ({v.source})
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draft.usePlatformCustom}
                              disabled={draft.saving}
                              onChange={(e) =>
                                updateDraft(v.id, { usePlatformCustom: e.target.checked })
                              }
                            />
                            <span>Offer</span>
                          </label>
                        </td>
                        <td className="px-3 py-3">
                          {draft.usePlatformCustom ? (
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              className="w-24"
                              value={draft.platformRate}
                              disabled={draft.saving}
                              onChange={(e) =>
                                updateDraft(v.id, { platformRate: e.target.value })
                              }
                            />
                          ) : (
                            <Text size="small" className="text-ui-fg-subtle">
                              Global ({defaultPlatformRate}%)
                            </Text>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge color={v.platform_source === "custom" ? "orange" : "grey"}>
                            {v.effective_platform_rate}% ({v.platform_source})
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            size="small"
                            variant="secondary"
                            disabled={draft.saving}
                            onClick={() => void saveVendor(v.id)}
                          >
                            {draft.saving ? "Saving…" : "Save"}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vendor Commission",
  icon: CurrencyDollar,
})

export default VendorCommissionPage
