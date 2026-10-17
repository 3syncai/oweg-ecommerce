"use client"

import { useState } from "react"
import type { SellerOffer } from "@/hooks/useSellerOffers"

type Props = {
  offers: SellerOffer[]
  selectedVariantId: string
  onSelect: (variantId: string) => void
  formatPrice: (value: number) => string
}

export default function SellerOffers({ offers, selectedVariantId, onSelect, formatPrice }: Props) {
  const [open, setOpen] = useState(false)
  if (!offers.length) return null
  const selected = offers.find(offer => offer.variant_id === selectedVariantId) || offers[0]
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Seller offers">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-slate-500">Sold by <span className="font-semibold text-slate-900">{selected.store_name}</span></p>
          <p className="text-sm text-slate-600">{formatPrice(selected.price)} · {selected.available} available</p>
        </div>
        {offers.length > 1 && (
          <button type="button" className="text-sm font-semibold text-green-700 underline" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            {open ? "Hide other sellers" : `See ${offers.length - 1} other seller${offers.length === 2 ? "" : "s"}`}
          </button>
        )}
      </div>
      {open && offers.length > 1 && (
        <div className="mt-3 space-y-2">
          {offers.map((offer, index) => (
            <button key={offer.variant_id} type="button" onClick={() => { onSelect(offer.variant_id); setOpen(false) }}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm ${selected.variant_id === offer.variant_id ? "border-green-600 bg-green-50" : "border-slate-200 hover:border-green-500"}`}>
              <span><span className="block font-semibold">{offer.store_name}</span><span className="text-slate-500">{index === 0 ? "Lowest price · " : ""}{offer.available} available</span></span>
              <span className="font-bold">{formatPrice(offer.price)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
