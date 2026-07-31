"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Input, Label, Text, clx } from "@medusajs/ui"
import { MagnifyingGlass, InformationCircleSolid } from "@medusajs/icons"
import { vendorGstApi } from "@/lib/api/client"
import {
  filterGstTaxCodes,
  suggestGstTaxCode,
  type GstTaxCode,
} from "@/lib/gst-tax-codes"

type GstTaxCodeFieldProps = {
  value: string
  onChange: (code: string, rate: number | null) => void
  suggestFrom?: string
  required?: boolean
}

export function GstTaxCodeField({
  value,
  onChange,
  suggestFrom,
  required = true,
}: GstTaxCodeFieldProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [suggested, setSuggested] = useState<GstTaxCode | null>(null)
  const [showTip, setShowTip] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Always filter locally so the dropdown never depends on Medusa being up.
  const codes = useMemo(() => filterGstTaxCodes(query), [query])

  const selected = useMemo(() => {
    const fromFilter = codes.find((c) => c.code === value)
    if (fromFilter) return fromFilter
    return filterGstTaxCodes("").find((c) => c.code === value) || null
  }, [codes, value])

  useEffect(() => {
    const local = suggestGstTaxCode(suggestFrom)
    setSuggested(local)

    if (!suggestFrom?.trim()) return

    let cancelled = false
    const t = window.setTimeout(async () => {
      try {
        const data = await vendorGstApi.listTaxCodes({ suggest: suggestFrom })
        if (!cancelled && data.suggested) setSuggested(data.suggested)
      } catch {
        // Keep local suggestion
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [suggestFrom])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-1 flex items-center gap-1.5">
        <Label>
          Tax Code {required && <span className="text-red-500">*</span>}
        </Label>
        <button
          type="button"
          className="relative text-ui-fg-muted hover:text-ui-fg-base"
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
          onClick={() => setShowTip((v) => !v)}
          aria-label="Tax code info"
        >
          <InformationCircleSolid />
          {showTip && (
            <span className="absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-900 px-3 py-2 text-left text-xs text-white shadow-lg">
              OWEG tax code which decides the goods and services tax for the listing
            </span>
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clx(
          "flex h-10 w-full items-center justify-between rounded-lg border bg-ui-bg-base px-3 text-left text-sm transition",
          open
            ? "border-ui-border-interactive"
            : "border-ui-border-base hover:border-ui-border-strong"
        )}
      >
        <span className={value ? "text-ui-fg-base" : "text-ui-fg-muted"}>
          {value || "Select One"}
          {selected ? ` · ${selected.rate}%` : ""}
        </span>
        <span className="text-ui-fg-muted">▾</span>
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-base shadow-lg">
          <div className="relative border-b border-ui-border-base p-2">
            <MagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-fg-muted" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GST_5, 18…"
              className="pl-8"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-ui-fg-subtle hover:bg-ui-bg-subtle"
              onClick={() => {
                onChange("", null)
                setOpen(false)
              }}
            >
              Select One
            </button>
            {codes.map((code) => (
              <button
                key={code.code}
                type="button"
                className={clx(
                  "block w-full px-3 py-2 text-left text-sm hover:bg-ui-bg-subtle",
                  value === code.code && "bg-oweg-500/10 text-oweg-900"
                )}
                onClick={() => {
                  onChange(code.code, code.rate)
                  setOpen(false)
                  setQuery("")
                }}
              >
                <span className="font-medium">{code.label}</span>
                <span className="ml-2 text-ui-fg-muted">{code.rate}%</span>
              </button>
            ))}
            {codes.length === 0 && (
              <Text size="small" className="px-3 py-2 text-ui-fg-muted">
                No matching tax codes
              </Text>
            )}
          </div>
        </div>
      )}

      {!value && suggested && (
        <button
          type="button"
          className="mt-2 text-left text-sm text-oweg-700 hover:underline"
          onClick={() => onChange(suggested.code, suggested.rate)}
        >
          Suggested for this product: {suggested.code} ({suggested.rate}%)
        </button>
      )}

      {value && (
        <Text size="small" className="mt-1.5 text-ui-fg-subtle">
          {selected?.description || "GST rate applied to this listing"}
        </Text>
      )}
    </div>
  )
}

export default GstTaxCodeField
