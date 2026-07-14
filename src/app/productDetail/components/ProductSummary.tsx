'use client'

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GitCompare, Heart, Minus, Plus, Share2, ShoppingCart } from 'lucide-react'
import type { DetailedProduct as DetailedProductType } from '@/lib/medusa'
import { isVariantPurchasable, resolveColorImageUrls } from '@/lib/medusa'
import { FlashSaleBadge } from '@/components/flash-sale/FlashSaleBadge'
import type { FlashSaleInfo } from '@/hooks/useFlashSale'

type ProductSummaryProps = {
  product: DetailedProductType
  brandName: string
  ratingValue: number
  reviewCount: number
  viewCount: number
  hasStock: boolean
  quantity: number
  selectedOptions: Record<string, string>
  onOptionChange: (optionTitle: string, value: string) => void
  onQuantityChange: (delta: number) => void
  onAddToCart: () => void
  onBuyNow: () => void
  onShare: () => void
  onSaveForLater: () => void
  onOpenCompare: () => void
  isWishlisted: boolean
  formatPrice: (value: number) => string
  flashSaleInfo?: FlashSaleInfo
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
  selectedOptions,
  onOptionChange,
  onQuantityChange,
  onAddToCart,
  onBuyNow,
  onShare,
  onSaveForLater,
  onOpenCompare,
  isWishlisted,
  formatPrice,
  flashSaleInfo,
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
    <div className="space-y-5 lg:pl-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-wide text-green-700">
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full">OWEG Exclusive</span>
          <span className="text-slate-400">|</span>
          <span>{brandName}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenCompare}
            className="flex items-center gap-1 rounded-full border border-green-200 px-3 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-50 transition"
          >
            <GitCompare className="w-4 h-4" />
            Compare
          </button>
          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-green-600 transition"
          >
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>
      </div>
      <div className="space-y-1">
        <h1
          ref={titleRef}
          className={`text-2xl lg:text-3xl font-semibold text-slate-900 ${
            titleExpanded ? '' : 'line-clamp-3'
          }`}
        >
          {product.title}
        </h1>
        {(titleOverflows || titleExpanded) && (
          <button
            type="button"
            onClick={() => setTitleExpanded((open) => !open)}
            className="text-sm font-semibold text-green-700 hover:text-green-800 transition"
            aria-expanded={titleExpanded}
          >
            {titleExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
      {(product.discount > 0 || flashSaleInfo?.active) && (
        <div className="inline-flex items-center gap-2 flex-wrap">
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
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              {product.discount}% OFF
            </span>
          )}
          <button
            type="button"
            onClick={onSaveForLater}
            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50/80 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition"
          >
            <Heart className="w-4 h-4" fill={isWishlisted ? 'currentColor' : 'none'} />
            <span className="hidden sm:inline">Save to wishlist</span>
          </button>
        </div>
      )}
      {product.subtitle && <p className="text-slate-500">{product.subtitle}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="text-3xl font-bold text-slate-900">{formatPrice(displayPrice)}</div>
        {displayMRP > displayPrice && (
          <div className="text-lg text-slate-400 line-through">{formatPrice(displayMRP)}</div>
        )}
        {rawSavings > 0 && (
          <span className="save-banner inline-flex items-center rounded-full bg-emerald-100/80 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm animate-[pulse_1.4s_ease-in-out_infinite]">
            You are about to save {formatPrice(rawSavings)}
          </span>
        )}
      </div>
      {/* Coins earned on purchase */}
      <div className="flex items-center gap-2 mt-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700">
          <img src="/uploads/coin/coin.png" alt="Coin" className="w-5 h-5 inline-block mr-1 object-contain" /> Earn {(displayPrice * 0.01).toFixed(0)} coins on this purchase
        </span>
        <span className="text-xs text-slate-400">1 coin = ₹1</span>
      </div>
      <div className="text-sm text-slate-500">Inclusive of all taxes | Prices shown in {product.currency}</div>
      {product.options.length > 0 && (
        <div className="space-y-4">
          {product.options.map((option) => {
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
                          ? 'border-green-600 bg-green-600 text-white shadow-sm'
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
      <style jsx global>{`
      body.lens-open .save-banner {
        display: none !important;
      }
    `}</style>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
        <div className={`text-sm font-medium ${hasStock ? 'text-green-600' : 'text-red-500'}`}>
          {hasStock ? 'In stock' : 'Out of stock'}
        </div>
      </div>

      <div className="sticky bottom-0 z-20 -mx-1 mt-4 bg-[#f3f8f3] px-1 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center border border-slate-200 rounded-full overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => onQuantityChange(-1)}
              className="px-3 py-2 text-slate-600 hover:bg-slate-50"
              aria-label="Decrease quantity"
            >
              <Minus className="w-4 h-4" />
            </button>
            <div className="px-4 text-base font-semibold text-slate-900">{quantity}</div>
            <button
              type="button"
              onClick={() => onQuantityChange(1)}
              className="px-3 py-2 text-slate-600 hover:bg-slate-50"
              aria-label="Increase quantity"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={onAddToCart}
              disabled={!hasStock}
              aria-disabled={!hasStock}
              className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-white font-semibold shadow transition ${hasStock
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-slate-400 cursor-not-allowed opacity-70'
                }`}
            >
              <ShoppingCart className="w-4 h-4" />
              Add to cart
            </button>
            <button
              type="button"
              onClick={onBuyNow}
              disabled={!hasStock}
              aria-disabled={!hasStock}
              className={`inline-flex items-center gap-2 rounded-full border px-6 py-3 font-semibold transition ${hasStock
                ? 'border-green-600 text-green-700 hover:bg-green-50'
                : 'border-slate-300 text-slate-400 cursor-not-allowed opacity-70'
                }`}
            >
              Buy now
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}

export default ProductSummary
