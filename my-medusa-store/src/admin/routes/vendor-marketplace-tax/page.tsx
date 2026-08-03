import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
import { Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

const VendorMarketplaceTaxPage = () => {
  const [tcsRate, setTcsRate] = useState("0.5")
  const [tdsRate, setTdsRate] = useState("0.1")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/admin/vendor-marketplace-tax", { credentials: "include" })
        if (!res.ok) throw new Error("Failed to load rates")
        const data = await res.json()
        setTcsRate(String(data.tcs_rate ?? 0.5))
        setTdsRate(String(data.tds_rate ?? 0.1))
      } catch {
        toast.error("Failed to load marketplace tax rates")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/admin/vendor-marketplace-tax", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tcs_rate: Number(tcsRate),
          tds_rate: Number(tdsRate),
        }),
      })
      if (!res.ok) throw new Error("Save failed")
      const data = await res.json()
      setTcsRate(String(data.rates.tcs_rate))
      setTdsRate(String(data.rates.tds_rate))
      toast.success("Marketplace tax rates saved")
    } catch {
      toast.error("Could not save marketplace tax rates")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-6 px-6 py-6">
        <div>
          <Heading level="h1">Marketplace Tax (TCS / TDS)</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Amazon / Flipkart-style deductions on vendor settlements. Applied on the GST taxable
            (ex-GST) value after inclusive price split. Shipping is excluded from the base.
          </Text>
        </div>

        <div className="max-w-lg rounded-lg border border-ui-border-base p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>GST TCS rate (%) — CGST s.52</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={tcsRate}
              disabled={loading || saving}
              onChange={(e) => setTcsRate(e.target.value)}
            />
            <Text size="small" className="text-ui-fg-subtle">
              Industry default 0.5% of taxable value (reclaimable GST credit for the vendor).
            </Text>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Income-tax TDS rate (%) — s.194-O</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={tdsRate}
              disabled={loading || saving}
              onChange={(e) => setTdsRate(e.target.value)}
            />
            <Text size="small" className="text-ui-fg-subtle">
              Industry default 0.1% of taxable value for all vendors (Form 26AS credit).
            </Text>
          </div>

          <Button onClick={save} disabled={loading || saving}>
            {saving ? "Saving…" : "Save rates"}
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Marketplace Tax",
  icon: CurrencyDollar,
})

export default VendorMarketplaceTaxPage
