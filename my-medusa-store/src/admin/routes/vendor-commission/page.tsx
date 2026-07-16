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
}

type DraftRow = {
  useCustom: boolean
  rate: string
  saving: boolean
}

const VendorCommissionPage = () => {
  const [defaultRate, setDefaultRate] = useState("2")
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({})
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/admin/vendor-commission", { credentials: "include" })
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()
      const list: VendorRow[] = data.vendors || []
      setDefaultRate(String(data.default_rate ?? 2))
      setVendors(list)
      const nextDrafts: Record<string, DraftRow> = {}
      for (const v of list) {
        nextDrafts[v.id] = {
          useCustom: v.commission_override,
          rate: String(v.commission_rate ?? data.default_rate ?? 2),
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
      toast.error("Enter a rate between 0 and 100")
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

  const saveVendor = async (vendorId: string) => {
    const draft = drafts[vendorId]
    if (!draft) return

    if (draft.useCustom) {
      const n = Number(draft.rate)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        toast.error("Custom rate must be between 0 and 100")
        return
      }
    }

    setDrafts((prev) => ({
      ...prev,
      [vendorId]: { ...prev[vendorId], saving: true },
    }))

    try {
      const body: { commission_override: boolean; commission_rate?: number } = {
        commission_override: draft.useCustom,
      }
      if (draft.useCustom) {
        body.commission_rate = Number(draft.rate)
      }

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

      toast.success(draft.useCustom ? "Custom commission saved" : "Using global default")
      await load()
    } catch (e: any) {
      toast.error(e?.message || "Could not save vendor commission")
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
            Set a global default, or pick any vendor below and give them their own commission rate.
          </Text>
        </div>

        <div className="max-w-md rounded-lg border border-ui-border-base p-4 flex flex-col gap-3">
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
            Used when a vendor does not have a custom rate.
          </Text>
          <Button onClick={saveDefault} disabled={loading || saving}>
            {saving ? "Saving…" : "Save default"}
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Heading level="h2">Vendors</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                Enable custom rate for a vendor and save — payouts will use that rate instead of the global default.
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
                    <th className="px-3 py-2 text-left font-medium">Custom</th>
                    <th className="px-3 py-2 text-left font-medium">Rate %</th>
                    <th className="px-3 py-2 text-left font-medium">Effective</th>
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => {
                    const draft = drafts[v.id] || {
                      useCustom: false,
                      rate: defaultRate,
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
