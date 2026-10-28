"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@medusajs/ui"
import { X, Calculator, ImageIcon } from "lucide-react"
import Image from "next/image"
import styles from "./BulkUpload.module.css"
import BulkPreviewPagination from "./BulkPreviewPagination"
import { bulkPreviewPage } from "@/lib/bulk-preview-page"
import ShippingEstimateDetails from "@/components/ShippingEstimateDetails"
import { hasUsableShippingQuote } from "@/lib/shipping-estimate"
import { vendorShippingApi } from "@/lib/api/client"
import { normalizeImageKey, isMediaUrl, type ParsedRow } from "@/lib/bulk-upload"
import { bulkPricingSignature, calculateBulkListing, type BulkPricingDecision } from "@/lib/bulk-pricing"
import { PLATFORM_FEE_RATE, COMMISSION_RATE, PARTNER_COMMISSION_RATE, PAYMENT_GATEWAY_RATE, TCS_RATE, TDS_RATE } from "@/lib/pricingConfig"
import { formatInr, getCalculatorProductPrice } from "@/lib/productPriceCalculator"

type Props = { rows: ParsedRow[]; imageMap: Record<string, { status: string; url?: string }>; disabled: boolean; onChange: (sku: string, decision: BulkPricingDecision | undefined) => void; page: number; onPageChange: (page: number) => void }
type QuoteState = { signature: string; status: "loading" | "ready" | "error"; message?: string }

export default function BulkPricingReview({ rows, imageMap, onChange, disabled, page, onPageChange }: Props) {
  const [quotes, setQuotes] = useState<Record<string, QuoteState>>({})
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const source = JSON.stringify(rows.map(row => [row.sku, bulkPricingSignature(row), row.errors]))
  // Price edits are held separately from source attributes so an override does not refetch logistics.
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  useEffect(() => {
    let cancelled = false
    const inputs = rowsRef.current.filter(row => !row.errors.length)
    const packages = new Map<string, Promise<Awaited<ReturnType<typeof vendorShippingApi.estimateRate>>>>()
    let next = 0
    async function worker() {
      while (next < inputs.length && !cancelled) {
        const row = inputs[next++]
        const signature = bulkPricingSignature(row)
        setQuotes(prev => ({ ...prev, [row.sku]: { signature, status: "loading" } }))
        onChange(row.sku, undefined)
        try {
          for (const field of ["length", "width", "height", "weight"] as const) {
            if (!Number.isFinite(Number(row[field])) || Number(row[field]) <= 0) throw new Error(`Enter a positive package ${field} in the Excel file`)
          }
          const params = { length: Number(row.length), width: Number(row.width), height: Number(row.height), weight: Number(row.weight), declared_value: Number(row.price), refresh: retry > 0 }
          const packageKey = JSON.stringify(params)
          let promise = packages.get(packageKey)
          if (!promise) { promise = vendorShippingApi.estimateRate(params); packages.set(packageKey, promise) }
          const quote = await promise
          if (cancelled) return
          if (!hasUsableShippingQuote(quote) || !quote.expires_at) throw new Error("No usable shipping quote is available. Refresh logistics or contact support for a shipping quote.")
          const base = Number(getCalculatorProductPrice(row.price, row.discountedPrice))
          const { suggestedPrice } = calculateBulkListing(base, quote.freight_charge, Number(row.gstRate))
          const previous = row.listingPricing
          onChange(row.sku, {
            signature, logisticsFee: quote.freight_charge,
            courierName: quote.courier_name, pickupPincode: quote.pickup_pincode, deliveryPincode: quote.delivery_pincode,
            shippingEstimate: quote,
            suggestedPrice, listingPrice: previous?.signature === signature && previous.listingPrice !== previous.suggestedPrice.toFixed(2) ? previous.listingPrice : suggestedPrice.toFixed(2),
          })
          setQuotes(prev => ({ ...prev, [row.sku]: { signature, status: "ready", message: quote.coverage_complete ? "Shipping calculated" : "Shipping estimated from available quotes. Some destinations could not be checked; you can submit." } }))
        } catch (error) {
          const apiError = error as { response?: { data?: { message?: string } } }
          if (!cancelled) setQuotes(prev => ({ ...prev, [row.sku]: { signature, status: "error", message: apiError.response?.data?.message || (error instanceof Error ? error.message : "Logistics estimate failed") } }))
        }
      }
    }
    void Promise.all([worker(), worker(), worker()])
    return () => { cancelled = true }
  }, [source, retry, onChange])

  useEffect(() => {
    const timer = setInterval(() => {
      if (disabled) return
      for (const row of rowsRef.current) {
        const expiry = row.listingPricing?.shippingEstimate?.expires_at
        if (expiry && Date.parse(expiry) <= Date.now()) {
          onChange(row.sku, undefined)
          setQuotes(prev => ({ ...prev, [row.sku]: { signature: bulkPricingSignature(row), status: "error", message: "Shipping quote expired. Refresh logistics before submitting." } }))
        }
      }
    }, 30000)
    return () => clearInterval(timer)
  }, [disabled, onChange])

  const selectedRow = rows.find(row => row.sku === selected)
  const preview = bulkPreviewPage(rows.length, page)
  return <section id="bulk-pricing" className={styles.section} aria-label="Listing prices">
    <div className={styles.pricingHeader}>
      <div className="min-w-0 flex-1"><p className={styles.eyebrow}>Pricing</p><h2 className={styles.sectionTitle}>Review listing prices</h2><p className="mt-1 text-sm text-ui-fg-subtle">Your base price plus package logistics and calculator charges. Review or edit each listing price.</p></div>
      <Button variant="secondary" type="button" disabled={disabled} onClick={() => setRetry(value => value + 1)}>Refresh logistics</Button>
    </div>
    <p className="text-xs text-ui-fg-muted">Listing prices include estimated package logistics. You can edit the price or open the calculation for each product.</p>
    <div className={styles.pricingGrid}>
      {rows.slice(preview.start, preview.end).map(row => {
        const decision = row.listingPricing
        const state = quotes[row.sku]
        const ready = decision?.signature === bulkPricingSignature(row) && state?.status === "ready"
        const base = getCalculatorProductPrice(row.price, row.discountedPrice)
        const thumbnail = [row.thumbnailRef, ...row.visualImageRefs, ...row.imageRefs].filter(Boolean).map(ref => {
          const uploaded = imageMap[normalizeImageKey(ref)]
          return uploaded?.status === "uploaded" ? uploaded.url : isMediaUrl(ref) ? ref : undefined
        }).find(Boolean)
        return <div key={row.sku} className={styles.priceCard}>
          <div className={styles.productIdentity}><ProductThumbnail src={thumbnail} title={row.title} /><div className="min-w-0"><h3 className="font-medium text-sm break-words">{row.title}</h3><p className="text-xs text-ui-fg-muted mt-1">{row.variantTitle || row.sku}</p><p className="text-xs text-ui-fg-subtle mt-1">{row.length} × {row.width} × {row.height} cm · {row.weight} kg</p><p className="text-xs mt-1 text-ui-fg-subtle">{state?.message || (row.errors.length ? "Fix the spreadsheet fields first" : "Calculating package logistics…")}</p></div></div>
          <div className={styles.basePrice}><span className="text-xs text-ui-fg-muted block">Excel base price</span><strong className="text-sm">{base ? formatInr(Number(base)) : "—"}</strong>{ready && <span className="block mt-1 text-xs text-ui-fg-muted">Suggested {formatInr(decision.suggestedPrice)}</span>}</div>
          <div className={styles.listingField}><label htmlFor={`listing-${row.sku}`} className="block text-xs font-medium mb-1.5">Listing price (INR) <span className="text-orange-700">*</span></label>
            <input id={`listing-${row.sku}`} aria-label={`Listing price for ${row.sku}`} inputMode="decimal" value={ready ? decision.listingPrice : ""} placeholder={state?.status === "error" ? "Estimate unavailable" : "Calculating…"} disabled={!ready || disabled}
              onChange={event => { if (/^\d*(?:\.\d{0,2})?$/.test(event.target.value) && decision) onChange(row.sku, { ...decision, listingPrice: event.target.value }) }} className="w-full rounded-lg border border-ui-border-base bg-ui-bg-base p-2 text-sm disabled:opacity-60" />
            {ready && !disabled && decision.listingPrice !== decision.suggestedPrice.toFixed(2) && <button type="button" className="text-xs text-emerald-700 mt-1" onClick={() => onChange(row.sku, { ...decision, listingPrice: decision.suggestedPrice.toFixed(2) })}>Use calculated price</button>}
            {ready && (!decision.listingPrice || Number(decision.listingPrice) <= 0) && <p className="text-xs text-red-600 mt-1">Enter a price greater than zero.</p>}
          </div>
          <Button className={styles.calculationButton} variant="secondary" type="button" disabled={!ready} onClick={() => setSelected(row.sku)}><Calculator size={15} />View calculation</Button>
        </div>
      })}
    </div>
    <BulkPreviewPagination total={rows.length} page={page} onPageChange={onPageChange} label="Listing price pages" />
    {selectedRow?.listingPricing && <CalculationDialog key={selectedRow.sku} row={selectedRow} onClose={() => setSelected(null)} />}
  </section>
}

function ProductThumbnail({ src, title }: { src?: string; title: string }) {
  const [failedSrc, setFailedSrc] = useState<string>()
  return <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ui-border-base bg-white">
    {src && failedSrc !== src ? <Image src={src} alt={title} width={56} height={56} unoptimized className="h-full w-full object-contain p-1" onError={() => setFailedSrc(src)} /> : <span role="img" aria-label={`Image unavailable for ${title}`} className="text-ui-fg-muted"><ImageIcon size={22} /></span>}
  </div>
}

function CalculationDialog({ row, onClose }: { row: ParsedRow; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  const decision = row.listingPricing!
  const base = Number(getCalculatorProductPrice(row.price, row.discountedPrice))
  const { calculation: c, suggestedPrice } = calculateBulkListing(base, decision.logisticsFee, Number(row.gstRate))
  const lines = [[`Platform fee (${PLATFORM_FEE_RATE}% of basic)`, c.platformFee], [`Commission (${COMMISSION_RATE}% of basic)`, c.commissionFee], [`Partner commission (${PARTNER_COMMISSION_RATE}% of base)`, c.partnerCommission], [`Payment gateway (${PAYMENT_GATEWAY_RATE}% of base)`, c.paymentGatewayFee], ["Package logistics", c.logisticsDeduction], [`TCS (${TCS_RATE}% of basic)`, c.tcs], [`TDS (${TDS_RATE}% of basic)`, c.tds]] as const
  return <dialog ref={ref} aria-labelledby="bulk-calculation-title" onCancel={event => { event.preventDefault(); onClose() }} className="w-[min(680px,calc(100vw-24px))] max-h-[90dvh] overflow-auto rounded-2xl border border-ui-border-base bg-ui-bg-base p-4 sm:p-6 text-ui-fg-base shadow-xl backdrop:bg-black/50">
    <div className="flex items-start justify-between gap-3"><div><h2 id="bulk-calculation-title" className="text-lg font-semibold">Product Price Calculator</h2><p className="mt-1 text-sm">{row.title}</p><p className="text-xs text-ui-fg-muted mt-1">{row.variantTitle || row.sku} · {row.taxCode} · {row.gstRate}% GST</p></div><button aria-label="Close calculation" onClick={onClose} className="p-2"><X size={20} /></button></div>
    <div className="my-5 rounded-xl bg-ui-bg-subtle p-4 text-sm space-y-2"><p>Excel base MRP <strong className="float-right">{formatInr(Number(row.price))}</strong></p><p>Excel base selling price <strong className="float-right">{formatInr(base)}</strong></p><p className="text-xs text-ui-fg-subtle">Basic {formatInr(c.item.basic)} + product GST {formatInr(c.item.gstOrTax)}. Product GST is already included in the base price.</p><p className="text-xs text-ui-fg-subtle">Package: {row.length} × {row.width} × {row.height} cm, {row.weight} kg.</p></div>
    {decision.shippingEstimate && <ShippingEstimateDetails estimate={decision.shippingEstimate} />}
    <p className="text-xs text-ui-fg-subtle mb-3">Charges below use the existing product calculator&apos;s rates applied to the Excel base price.</p>
    <div className="overflow-x-auto"><table className="w-full table-fixed text-[10px] sm:text-sm"><thead><tr className="border-b border-ui-border-base text-ui-fg-muted"><th className="w-[43%] text-left py-2">Charge</th><th className="text-right">Basic</th><th className="text-right">GST / tax</th><th className="text-right">Total</th></tr></thead><tbody>{lines.map(([label, amount]) => <tr key={label} className="border-b border-ui-border-base/50"><td className="py-2">{label}</td><td className="text-right">{formatInr(amount.basic)}</td><td className="text-right">{formatInr(amount.gstOrTax)}</td><td className="text-right">{formatInr(amount.total)}</td></tr>)}</tbody></table></div>
    <div className="mt-4 space-y-2 text-sm"><p>Total charges <strong className="float-right">{formatInr(c.totalDeductionsAmount)}</strong></p><p className="border-t border-ui-border-base pt-3">Calculated listing price <strong className="float-right">{formatInr(suggestedPrice)}</strong></p><p className="text-xs text-ui-fg-subtle">Base price + the charges above. This is not a guaranteed settlement amount.</p><p className="rounded-lg bg-emerald-50 p-3 text-emerald-900">Your listing price <strong className="float-right">{formatInr(Number(decision.listingPrice))}</strong></p></div>
    <div className="flex justify-end mt-5"><Button variant="secondary" onClick={onClose}>Close</Button></div>
  </dialog>
}
