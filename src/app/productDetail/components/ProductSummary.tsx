'use client'

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GitCompare, Heart, Loader2, Minus, Plus, Share2, ShoppingCart } from 'lucide-react'
import type { DetailedProduct as DetailedProductType } from '@/lib/medusa'
import { isVariantPurchasable, resolveColorImageUrls } from '@/lib/medusa'
import { FlashSaleBadge } from '@/components/flash-sale/FlashSaleBadge'
import type { FlashSaleInfo } from '@/hooks/useFlashSale'
import styles from '../ProductDetail.module.css'

type ProductSummaryProps = {
  product: DetailedProductType
  brandName: string
  ratingValue: number
  reviewCount: number
  viewCount: number
  hasStock: boolean
  quantity: number
  maxQuantity: number
  selectedOptions: Record<string, string>
  onOptionChange: (optionTitle: string, value: string) => void
  onQuantityChange: (delta: number) => void
  onAddToCart: () => void
  onBuyNow: () => void
  cartBusy?: boolean
  buyNowBusy?: boolean
  onShare: () => void
  onSaveForLater: () => void
  onOpenCompare: () => void
  isWishlisted: boolean
  formatPrice: (value: number) => string
  flashSaleInfo?: FlashSaleInfo
  sellerOffers?: React.ReactNode
}

function isOptionValueAvailable(
  product: DetailedProductType,
  selectedOptions: Record<string, string>,
  optionTitle: string,
  value: string
) {
  return product.variants.some((variant) => {
    if (variant.options[optionTitle] !== value) return false
    return product.options.every((opt) => {
      if (opt.title === optionTitle) return true
      const selected = selectedOptions[opt.title]
      if (!selected) return true
      return variant.options[opt.title] === selected
    })
  })
}

function isOptionValuePurchasable(
  product: DetailedProductType,
  selectedOptions: Record<string, string>,
  optionTitle: string,
  value: string
) {
  return product.variants.some((variant) => {
    if (variant.options[optionTitle] !== value) return false
    const matchesOtherOptions = product.options.every((opt) => {
      if (opt.title === optionTitle) return true
      const selected = selectedOptions[opt.title]
      if (!selected) return true
      return variant.options[opt.title] === selected
    })
    return matchesOtherOptions && isVariantPurchasable(variant)
  })
}

function getVisualOptionTitle(product: DetailedProductType): string | undefined {
  if (product.primaryVisualOption) return product.primaryVisualOption
  return product.options.find((opt) =>
    /color|colour|pattern|finish|shade|style/i.test(opt.title)
  )?.title
}

function getSwatchImage(
  product: DetailedProductType,
  _visualOptionTitle: string,
  value: string
): string | undefined {
  return resolveColorImageUrls(value, product.colorImages)?.[0] || product.images?.[0]
}

const ProductSummary = ({
  product,
  brandName,
  hasStock,
  quantity,
  maxQuantity,
  selectedOptions,
  onOptionChange,
  onQuantityChange,
  onAddToCart,
  onBuyNow,
  cartBusy = false,
  buyNowBusy = false,
  onShare,
  onSaveForLater,
  onOpenCompare,
  isWishlisted,
  formatPrice,
  flashSaleInfo,
  sellerOffers,
}: ProductSummaryProps) => {
  // Use flash sale price if available, otherwise use product price
  const displayPrice = flashSaleInfo?.active && flashSaleInfo.flash_sale_price !== undefined
    ? flashSaleInfo.flash_sale_price
    : (typeof product.price === 'number' ? product.price : 0)

  // Use flash sale original price as MRP if available, otherwise use product MRP
  const displayMRP = flashSaleInfo?.active && flashSaleInfo.original_price !== undefined
    ? flashSaleInfo.original_price
    : (typeof product.mrp === 'number' ? product.mrp : displayPrice)

  const rawSavings = displayMRP > displayPrice ? displayMRP - displayPrice : 0
  const visualOptionTitle = getVisualOptionTitle(product)
  const visibleOptions = product.options.filter((option) => !(
    option.title.trim().toLowerCase() === 'default' &&
    option.values.every((value) => value.trim().toLowerCase() === 'default')
  ))

  const titleRef = useRef<HTMLHeadingElement>(null)
  const [titleExpanded, setTitleExpanded] = useState(false)
  const [titleOverflows, setTitleOverflows] = useState(false)

  useLayoutEffect(() => {
    setTitleExpanded(false)
  }, [product.title])

  useEffect(() => {
    const el = titleRef.current
    if (!el) return

    const measure = () => {
      if (titleExpanded) {
        // While expanded, keep the toggle if we already know it overflows.
        return
      }
      // Clamp is applied; overflow when full content taller than the clamped box.
      setTitleOverflows(el.scrollHeight > el.clientHeight + 1)
    }

    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [product.title, titleExpanded])

  // When collapsing after expand, re-measure overflow on next paint.
  useEffect(() => {
    if (titleExpanded) return
    const el = titleRef.current
    if (!el) return
    const id = window.requestAnimationFrame(() => {
      setTitleOverflows(el.scrollHeight > el.clientHeight + 1)
    })
    return () => window.cancelAnimationFrame(id)
  }, [titleExpanded, product.title])

  return (
    <div className={styles.summary}>
      <div className={styles.summaryTop}>
        <div className={styles.brandLine}>
          <span className={styles.exclusive}>OWEG Exclusive</span>
          <span className={styles.brand}>{brandName}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenCompare}
            className={styles.utilityButton}
          >
            <GitCompare className="w-4 h-4" />
            Compare
          </button>
          <button
            type="button"
            onClick={onShare}
            className={styles.utilityButton}
          >
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>
      </div>
      <div className="space-y-1">
        <h1
          ref={titleRef}
          className={`${styles.productTitle} ${
            titleExpanded ? '' : 'line-clamp-3'
          }`}
        >
          {product.title}
        </h1>
        {(titleOverflows || titleExpanded) && (
          <button
            type="button"
            onClick={() => setTitleExpanded((open) => !open)}
            className={styles.titleToggle}
            aria-expanded={titleExpanded}
          >
            {titleExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
      <div className={styles.priceSection}>
        <div className={styles.priceRow}>
          <span className={styles.price}>{formatPrice(displayPrice)}</span>
          {displayMRP > displayPrice && <span className={styles.mrp}>{formatPrice(displayMRP)}</span>}
        </div>
        <div className={styles.savingsRow}>
          {flashSaleInfo?.active && (
            <>
              <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                FLASH SALE
              </span>
              {flashSaleInfo.expires_at && (
                <FlashSaleBadge
                  expiresAt={flashSaleInfo.expires_at}
                  timeRemainingMs={flashSaleInfo.time_remaining_ms}
                />
              )}
            </>
          )}
          {product.discount > 0 && !flashSaleInfo?.active && (
            <span className={styles.discount}>
              {product.discount}% OFF
            </span>
          )}
          {rawSavings > 0 && <span className={styles.savings}>You save {formatPrice(rawSavings)}</span>}
        </div>
        <p className={styles.taxNote}>Inclusive of all taxes | Prices shown in {product.currency}</p>
      </div>
      {product.subtitle && <p className={styles.subtitle}>{product.subtitle}</p>}
      {/* Coins earned on purchase */}
      <div className={styles.rewards}>
        <span className={styles.rewardLine}>
          <img src="/uploads/coin/coin.png" alt="Coin" className="w-4 h-4 object-contain" /> Earn {(displayPrice * 0.01).toFixed(0)} coins on this purchase
        </span>
        <span>1 coin = ₹1</span>
      </div>
      {visibleOptions.length > 0 && (
        <div className="space-y-4">
          {visibleOptions.map((option) => {
            const isVisualOption = visualOptionTitle === option.title
            return (
            <div key={option.id} className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">
                {option.title}
                {selectedOptions[option.title] ? (
                  <span className="ml-2 font-normal text-slate-500">
                    : {selectedOptions[option.title]}
                  </span>
                ) : null}
              </p>
              {isVisualOption && product.colorImages && Object.keys(product.colorImages).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {option.values.map((value) => {
                    const isSelected = selectedOptions[option.title] === value
                    const isAvailable = isOptionValueAvailable(
                      product,
                      selectedOptions,
                      option.title,
                      value
                    )
                    const swatchImage = getSwatchImage(product, option.title, value)
                    return (
                      <button
                        key={`${option.id}-${value}`}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => onOptionChange(option.title, value)}
                        className={`relative h-16 w-16 overflow-hidden rounded-lg border-2 transition ${
                          isSelected
                            ? 'border-green-600 ring-2 ring-green-200'
                            : isAvailable
                              ? 'border-slate-200 hover:border-green-400'
                              : 'border-slate-100 opacity-40 cursor-not-allowed'
                        }`}
                        aria-pressed={isSelected}
                        aria-label={`${option.title} ${value}`}
                        title={value}
                      >
                        {swatchImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={swatchImage}
                            alt={value}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-slate-100 text-[10px] font-medium text-slate-600 px-1 text-center">
                            {value}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
              <div className="flex flex-wrap gap-2">
                {option.values.map((value) => {
                  const isSelected = selectedOptions[option.title] === value
                  const isAvailable = isOptionValueAvailable(
                    product,
                    selectedOptions,
                    option.title,
                    value
                  )
                  const isPurchasable = isOptionValuePurchasable(
                    product,
                    selectedOptions,
                    option.title,
                    value
                  )
                  return (
                    <button
                      key={`${option.id}-${value}`}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => onOptionChange(option.title, value)}
                      className={`min-w-[3rem] rounded-full border px-4 py-2 text-sm font-medium transition ${
                        isSelected
                          ? 'border-[#7ac943] bg-[#edf5e5] text-[#3c5b28]'
                          : isAvailable
                            ? isPurchasable
                              ? 'border-slate-200 bg-white text-slate-800 hover:border-green-400 hover:text-green-700'
                              : 'border-slate-200 bg-slate-50 text-slate-400 line-through'
                            : 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                      }`}
                      aria-pressed={isSelected}
                      aria-label={`${option.title} ${value}`}
                    >
                      {value}
                    </button>
                  )
                })}
              </div>
              )}
            </div>
          )})}
        </div>
      )}
      {sellerOffers}
      <div className={styles.stockRow}>
        <div className={`${styles.stock} ${hasStock ? styles.inStock : styles.outOfStock}`}>
          {hasStock ? 'In stock' : 'Out of stock'}
        </div>
        <button type="button" onClick={onSaveForLater} className={styles.wishlistButton}>
          <Heart className="w-4 h-4" fill={isWishlisted ? 'currentColor' : 'none'} aria-hidden="true" />
          Save to wishlist
        </button>
      </div>

      <div className={styles.purchaseArea}>
        <div className={styles.quantityRow}>
          <span className={styles.quantityLabel}>Quantity</span>
          <div className={styles.quantityControl}>
            <button
              type="button"
              onClick={() => onQuantityChange(-1)}
              className={styles.quantityButton}
              aria-label="Decrease quantity"
            >
              <Minus className="w-4 h-4" />
            </button>
            <div className={styles.quantityValue} aria-live="polite">{quantity}</div>
            <button
              type="button"
              onClick={() => onQuantityChange(1)}
              className={styles.quantityButton}
              aria-label="Increase quantity"
              disabled={quantity >= maxQuantity}
              title={quantity >= maxQuantity ? `Maximum ${maxQuantity} per order` : undefined}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
          <div className={styles.purchaseButtons}>
            <button
              type="button"
              onClick={onAddToCart}
              disabled={!hasStock || cartBusy || buyNowBusy}
              aria-disabled={!hasStock || cartBusy || buyNowBusy}
              aria-busy={cartBusy || undefined}
              className={`${styles.cartButton} ${cartBusy ? 'cursor-wait' : ''}`}
            >
              {cartBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              ) : (
                <ShoppingCart className="w-4 h-4" />
              )}
              {cartBusy ? 'Adding…' : 'Add to cart'}
            </button>
            <button
              type="button"
              onClick={onBuyNow}
              disabled={!hasStock || cartBusy || buyNowBusy}
              aria-disabled={!hasStock || cartBusy || buyNowBusy}
              aria-busy={buyNowBusy || undefined}
              className={`${styles.buyButton} ${buyNowBusy ? 'cursor-wait' : ''}`}
            >
              {buyNowBusy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  Redirecting…
                </>
              ) : (
                'Buy now'
              )}
            </button>
          </div>
      </div>

    </div>
  )
}

export default ProductSummary
