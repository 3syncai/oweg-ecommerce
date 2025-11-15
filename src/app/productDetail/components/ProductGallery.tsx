'use client'

import React from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type ProductGalleryProps = {
  images: string[]
  selectedIndex: number
  onSelect: (index: number) => void
  fallback: string
}

const ProductGallery = ({ images, selectedIndex, onSelect, fallback }: ProductGalleryProps) => {
  const activeImage = images[selectedIndex] || fallback
  const hasMultiple = images.length > 1

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!hasMultiple) return
    const delta = direction === 'prev' ? -1 : 1
    const next = (selectedIndex + delta + images.length) % images.length
    onSelect(next)
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-square rounded-[32px] border border-[var(--detail-border)] bg-white shadow-sm overflow-hidden group">
        <Image
          src={activeImage}
          alt="Selected product image"
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-contain p-4 lg:p-10 transition-transform duration-300 group-hover:scale-105"
          priority
        />
        {hasMultiple && (
          <div className="absolute inset-x-0 bottom-4 flex justify-between px-4">
            <button
              type="button"
              onClick={() => handleNavigate('prev')}
              className="w-10 h-10 rounded-full bg-white/90 text-slate-700 flex items-center justify-center shadow border border-slate-100"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('next')}
              className="w-10 h-10 rounded-full bg-white/90 text-slate-700 flex items-center justify-center shadow border border-slate-100"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {images.map((img, idx) => (
          <button
            key={`${img}-${idx}`}
            type="button"
            onClick={() => onSelect(idx)}
            onMouseEnter={() => onSelect(idx)}
            onFocus={() => onSelect(idx)}
            className={`aspect-square rounded-2xl border ${
              selectedIndex === idx ? 'border-green-500 ring-2 ring-green-100' : 'border-slate-200'
            } overflow-hidden bg-white`}
          >
            <Image src={img} alt={`Gallery thumbnail ${idx + 1}`} width={200} height={200} className="object-contain w-full h-full p-2" />
          </button>
        ))}
      </div>
    </div>
  )
}

export default ProductGallery
