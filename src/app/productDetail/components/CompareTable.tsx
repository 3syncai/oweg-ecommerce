'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Heart, ShoppingCart, Star } from 'lucide-react'
import type { ComparisonColumn } from '../types'

type CompareTableProps = {
  columns: ComparisonColumn[]
  formatPrice: (value: number) => string
  onRemove: (id: string | number) => void
  onAddToCart: (variantId?: string, qty?: number) => void
  onWishlist: () => void
}

const comparisonRows = [
  { key: 'image', label: 'Image' },
  { key: 'name', label: 'Product name' },
  { key: 'price', label: 'Price' },
  { key: 'brand', label: 'Brand' },
  { key: 'model', label: 'Model' },
  { key: 'availability', label: 'Availability' },
  { key: 'rating', label: 'Rating' },
  { key: 'summary', label: 'Summary' },
  { key: 'weight', label: 'Weight' },
  { key: 'dimensions', label: 'Dimensions (L × W × H)' },
  { key: 'actions', label: 'Actions' },
] as const

const renderRatingStars = (value: number) => {
  const clamped = Math.max(0, Math.min(5, value))
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, idx) => (
        <Star
          key={`rating-star-${idx}`}
          className={`w-4 h-4 ${idx + 1 <= Math.round(clamped) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'}`}
        />
      ))}
      <span className="text-xs text-slate-500 ml-1">{clamped.toFixed(1)}</span>
    </div>
  )
}

const CompareTable = ({ columns, formatPrice, onRemove, onAddToCart, onWishlist }: CompareTableProps) => (
  <div className="overflow-x-auto">
    <table className="min-w-[900px] w-full border-separate border-spacing-0">
      <thead>
        <tr>
          <th className="w-48 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 border border-slate-200 rounded-l-2xl bg-white">
            Factors
          </th>
          {columns.map((column) => (
            <th
              key={`col-head-${column.key}`}
              className="min-w-[220px] px-4 py-2 text-left align-bottom border border-slate-200 bg-white first:border-l-0 last:rounded-r-2xl"
            >
              <div className="relative pr-6">
                <p className="text-sm font-semibold text-slate-900">
                  {column.idx === 0 ? 'Current selection' : `Option ${column.idx}`}
                </p>
                {!column.isBase && (
                  <button
                    type="button"
                    onClick={() => onRemove(column.item.id)}
                    className="absolute top-0 right-0 text-[11px] text-slate-400 hover:text-red-500"
                  >
                    Remove
                  </button>
                )}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {comparisonRows.map((row, rowIdx) => (
          <tr key={row.key} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
            <td className="align-top px-4 py-3 text-sm font-semibold text-slate-600 border border-slate-200 border-t-0 first:rounded-bl-2xl">
              {row.label}
            </td>
            {columns.map((column) => {
              let content: React.ReactNode = '-'
              switch (row.key) {
                case 'image':
                  content = column.loading && !column.detail ? (
                    <span className="text-xs text-slate-400">Fetching specs...</span>
                  ) : (
                    <div className="relative mx-auto h-32 w-32 rounded-2xl bg-slate-50 overflow-hidden">
                      <Image
                        src={column.item.image || column.detail?.images?.[0] || '/oweg_logo.png'}
                        alt={column.item.name}
                        fill
                        className="object-contain p-3"
                      />
                    </div>
                  )
                  break
                case 'name':
                  content = (
                    <Link href={column.productHref} className="text-sm font-semibold text-green-700 hover:underline">
                      {column.item.name}
                    </Link>
                  )
                  break
                case 'price':
                  content = (
                    <div className="flex flex-col">
                      <span className="text-base font-semibold text-slate-900">{formatPrice(column.item.price)}</span>
                      <span className="text-xs text-slate-400 line-through">{formatPrice(column.item.mrp)}</span>
                    </div>
                  )
                  break
                case 'brand':
                  content = column.brand || '-'
                  break
                case 'model':
                  content = column.model || '-'
                  break
                case 'availability':
                  content = (
                    <span
                      className={`text-sm font-medium ${
                        column.availabilityState === 'in'
                          ? 'text-green-600'
                          : column.availabilityState === 'out'
                          ? 'text-red-500'
                          : 'text-slate-500'
                      }`}
                    >
                      {column.availabilityLabel}
                    </span>
                  )
                  break
                case 'rating':
                  content = renderRatingStars(column.rating || 4.5)
                  break
                case 'summary':
                  content = <p className="text-sm text-slate-600 leading-relaxed">{column.summary}</p>
                  break
                case 'weight':
                  content = column.weight
                  break
                case 'dimensions':
                  content = column.dimensions
                  break
                case 'actions':
                  content = (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          onAddToCart(column.variantId, 1)
                        }}
                        className="inline-flex items-center justify-center gap-1 rounded-full bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:bg-slate-300 disabled:text-slate-500"
                        disabled={!column.variantId}
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        Add to cart
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          onWishlist()
                        }}
                        className="inline-flex items-center justify-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-pink-400 hover:text-pink-500"
                      >
                        <Heart className="w-3.5 h-3.5" />
                        Wishlist
                      </button>
                    </div>
                  )
                  break
                default:
                  break
              }

              return (
                <td key={`${row.key}-${column.key}`} className="align-top px-4 py-3 text-sm text-slate-700 border border-slate-200 border-l-0 border-t-0">
                  {content}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

export default CompareTable


