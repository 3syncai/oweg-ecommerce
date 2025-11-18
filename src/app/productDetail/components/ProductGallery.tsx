'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react'

type ProductGalleryProps = {
  images: string[]
  selectedIndex: number
  onSelect: (index: number) => void
  fallback: string
}

const ProductGallery = ({ images, selectedIndex, onSelect, fallback }: ProductGalleryProps) => {
  const activeImage = images[selectedIndex] || fallback
  const hasMultiple = images.length > 1
  const [fullscreenOpen, setFullscreenOpen] = useState(false)

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!hasMultiple) return
    const delta = direction === 'prev' ? -1 : 1
    const next = (selectedIndex + delta + images.length) % images.length
    onSelect(next)
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-square rounded-[32px] border border-[var(--detail-border)] bg-white shadow-sm overflow-hidden group">
        <button
          type="button"
          onClick={() => setFullscreenOpen(true)}
          className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-700 shadow hover:bg-white"
          aria-label="Open fullscreen image viewer"
        >
          <Expand className="h-5 w-5" />
        </button>
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
      {fullscreenOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4 py-6"
          onClick={() => setFullscreenOpen(false)}
        >
          <button
            type="button"
            onClick={() => setFullscreenOpen(false)}
            className="absolute right-6 top-6 rounded-full border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
          >
            Close
          </button>
          <div
            className="relative w-full max-w-4xl h-[70vh] sm:h-[75vh]"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={activeImage}
              alt="Fullscreen product image"
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default ProductGallery
