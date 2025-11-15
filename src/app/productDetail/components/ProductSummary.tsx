'use client'

import React from 'react'
import {
  Bookmark,
  Eye,
  GitCompare,
  Minus,
  Plus,
  Share2,
  ShoppingCart,
  Star,
} from 'lucide-react'
import type { DetailedProduct as DetailedProductType } from '@/lib/medusa'

type ProductSummaryProps = {
  product: DetailedProductType
  brandName: string
  ratingValue: number
  reviewCount: number
  viewCount: number
  hasStock: boolean
  quantity: number
  onQuantityChange: (delta: number) => void
  onAddToCart: () => void
  onBuyNow: () => void
  onShare: () => void
  onSaveForLater: () => void
  onOpenCompare: () => void
  formatPrice: (value: number) => string
}

const ProductSummary = ({
  product,
  brandName,
  ratingValue,
  reviewCount,
  viewCount,
  hasStock,
  quantity,
  onQuantityChange,
  onAddToCart,
  onBuyNow,
  onShare,
  onSaveForLater,
  onOpenCompare,
  formatPrice,
}: ProductSummaryProps) => (
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
    <h1 className="text-2xl lg:text-3xl font-semibold text-slate-900">{product.title}</h1>
    {product.subtitle && <p className="text-slate-500">{product.subtitle}</p>}

    <div className="flex flex-wrap items-end gap-3">
      <div className="text-3xl font-bold text-slate-900">{formatPrice(product.price)}</div>
      <div className="text-lg text-slate-400 line-through">{formatPrice(product.mrp)}</div>
      {product.discount > 0 && (
        <span className="text-sm font-semibold text-green-600 bg-green-100/60 px-3 py-1 rounded-full">
          {product.discount}% OFF
        </span>
      )}
    </div>
    <div className="text-sm text-slate-500">Inclusive of all taxes | Prices shown in {product.currency}</div>

    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
      <div className="flex items-center gap-1">
        <Star className="w-4 h-4 text-yellow-500" />
        <span className="font-semibold text-slate-900">{ratingValue.toFixed(1)}</span>
        <span className="text-slate-400">({reviewCount}+ ratings)</span>
      </div>
      <div className="flex items-center gap-1 text-slate-600">
        <Eye className="w-4 h-4 text-slate-500" aria-hidden="true" />
        <span>{new Intl.NumberFormat('en-IN').format(viewCount)}+ views</span>
      </div>
      <div className={`text-sm font-medium ${hasStock ? 'text-green-600' : 'text-red-500'}`}>
        {hasStock ? 'In stock' : 'Out of stock'}
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-6">
      <div className="flex items-center border border-slate-200 rounded-full overflow-hidden">
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
          className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-white font-semibold shadow transition ${
            hasStock
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
          className="inline-flex items-center gap-2 rounded-full border border-green-600 px-6 py-3 text-green-700 font-semibold hover:bg-green-50 transition"
        >
          Buy now
        </button>
      </div>
    </div>

    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onSaveForLater}
        className="flex items-center gap-2 text-sm text-slate-600 hover:text-green-600 transition"
      >
        <Bookmark className="w-4 h-4" />
        Save for later
      </button>
    </div>
  </div>
)

export default ProductSummary
