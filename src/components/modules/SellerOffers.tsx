"use client"

import { useId, useState } from "react"
import { Check, ChevronDown, Store } from "lucide-react"
import type { SellerOffer } from "@/hooks/useSellerOffers"
import styles from "@/app/productDetail/ProductDetail.module.css"

type Props = {
  offers: SellerOffer[]
  selectedVariantId: string
  onSelect: (variantId: string) => void
  formatPrice: (value: number) => string
}

export default function SellerOffers({ offers, selectedVariantId, onSelect, formatPrice }: Props) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  if (!offers.length) return null
  const selected = offers.find(offer => offer.variant_id === selectedVariantId) || offers[0]
  return (
    <section className={styles.sellerOffers} aria-label="Seller offers">
      <div className={styles.sellerHeading}>
        <h2>Seller offers <span>{offers.length}</span></h2>
        {offers.length > 1 && (
          <button type="button" className={styles.sellerToggle} aria-controls={listId} aria-expanded={open} onClick={() => setOpen(value => !value)}>
            {open ? "Hide sellers" : "Compare sellers"}
            <ChevronDown size={15} className={open ? styles.chevronOpen : undefined} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className={styles.selectedSeller}>
        <span className={styles.sellerIcon}><Store size={20} aria-hidden="true" /></span>
        <div className={styles.sellerIdentity}>
          <span className={styles.sellerEyebrow}>Sold by</span>
          <strong>{selected.store_name}</strong>
          <span className={styles.sellerAvailability}>{selected.available} available</span>
        </div>
        <div className={styles.sellerPrice}>
          <strong>{formatPrice(selected.price)}</strong>
          <span><Check size={12} aria-hidden="true" /> Selected</span>
        </div>
      </div>
      {open && offers.length > 1 && (
        <div id={listId} className={styles.sellerList}>
          <p>Choose a seller for this product</p>
          {offers.map((offer, index) => (
            <button key={offer.variant_id} type="button" onClick={() => { onSelect(offer.variant_id); setOpen(false) }}
              aria-pressed={selected.variant_id === offer.variant_id}
              className={`${styles.sellerOption} ${selected.variant_id === offer.variant_id ? styles.sellerOptionSelected : ""}`}>
              <span className={styles.sellerRadio}>{selected.variant_id === offer.variant_id && <Check size={12} aria-hidden="true" />}</span>
              <span className={styles.sellerIdentity}><strong>{offer.store_name}</strong><span>{index === 0 ? "Lowest price · " : ""}{offer.available} available</span></span>
              <strong className={styles.offerPrice}>{formatPrice(offer.price)}</strong>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
