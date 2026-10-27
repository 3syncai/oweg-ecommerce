"use client"

import { useState } from "react"
import { Button, Input, Text, Label, toast } from "@medusajs/ui"
import { createVariantRowFromOptions, type VariantMatrixRow } from "@/lib/variant-matrix"

export type SharedCatalogVariant = { sku: string; options: Record<string, string> }
type Props = {
  catalog: SharedCatalogVariant[]
  variants: VariantMatrixRow[]
  onAdd: (variant: VariantMatrixRow) => void
  onRemove: (index: number) => void
}
const keyOf = (options: Record<string, string>) => JSON.stringify(Object.entries(options).map(([key, value]) => [key.trim().toLowerCase(), value.trim().toLowerCase()]).sort())

export default function SharedVariantRequests({ catalog, variants, onAdd, onRemove }: Props) {
  const [options, setOptions] = useState<Record<string, string>>({ ...(catalog[0]?.options || {}) })
  const [sku, setSku] = useState("")
  const names = Object.keys(catalog[0]?.options || {}).filter(name => !["default", "default option"].includes(name.toLowerCase()))
  if (!names.length) return null
  const add = () => {
    const publicSku = sku.trim().toUpperCase()
    if (!publicSku || names.some(name => !options[name]?.trim())) {
      toast.error("Complete every option and enter a new SKU")
      return
    }
    const existing = catalog.find(row => keyOf(row.options) === keyOf(options))
    if (existing) {
      toast.info("Variant already in catalog", { description: `Use the existing row with SKU ${existing.sku}.` })
      return
    }
    if (variants.some(row => row.sku.trim().toUpperCase() === publicSku || keyOf(row.optionValues) === keyOf(options))) {
      toast.error("This SKU or combination is already in your listing")
      return
    }
    onAdd({ ...createVariantRowFromOptions(Object.fromEntries(names.map(name => [name, options[name].trim()]))), sku: publicSku })
    setSku("")
    toast.success("Variant added for review", { description: "Set its MRP and stock above. The full listing needs admin approval." })
  }
  return (
    <section className="min-w-0 rounded-xl border border-ui-border-base bg-ui-bg-base p-5 space-y-4" aria-label="Request new catalog variants">
      <div>
        <Text weight="plus">Need another size or combination?</Text>
        <Text size="small" className="text-ui-fg-subtle">Add a variant of this same product. Admin will review the full listing before it goes live. Other vendors&apos; listings stay unchanged.</Text>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {names.map(name => <div className="space-y-1" key={name}>
          <Label htmlFor={`request-option-${name}`}>{name}</Label>
          <Input id={`request-option-${name}`} value={options[name] || ""} onChange={event => setOptions(prev => ({ ...prev, [name]: event.target.value }))} />
        </div>)}
        <div className="space-y-1">
          <Label htmlFor="request-variant-sku">New variant SKU</Label>
          <Input id="request-variant-sku" value={sku} onChange={event => setSku(event.target.value)} placeholder="Manufacturer SKU for the new variant" />
        </div>
      </div>
      <Button type="button" variant="secondary" onClick={add}>Add variant for review</Button>
      {variants.length > catalog.length && <div className="divide-y divide-ui-border-base">
        {variants.slice(catalog.length).map((row, index) => <div key={index} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="min-w-0 break-words"><Text size="small" weight="plus">{Object.values(row.optionValues).join(" / ")} · {row.sku}</Text><Text size="xsmall" className="text-ui-fg-subtle">New variant · requires listing approval</Text></div>
          <Button type="button" size="small" variant="transparent" onClick={() => onRemove(catalog.length + index)}>Remove request</Button>
        </div>)}
      </div>}
    </section>
  )
}
