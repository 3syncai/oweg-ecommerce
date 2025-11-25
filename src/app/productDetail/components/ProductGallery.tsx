'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { getImageUrlForNewTab } from '@/lib/image-utils'

type ProductGalleryProps = {
  images: string[]
  selectedIndex: number
  onSelect: (index: number) => void
  fallback: string
}

const LENS_SIZE = 160
const ZOOM_SCALE = 2.2

const ProductGallery = ({ images, selectedIndex, onSelect, fallback }: ProductGalleryProps) => {
  const activeImage = images[selectedIndex] || fallback
  const hasMultiple = images.length > 1
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [lensActive, setLensActive] = useState(false)
  const [lensPosition, setLensPosition] = useState({ x: LENS_SIZE / 2, y: LENS_SIZE / 2 })
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (!fullscreenOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [fullscreenOpen])

  useEffect(() => {
    setMounted(true)
  }, [])

  const clampLens = (clientX: number, clientY: number) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return lensPosition
    const half = LENS_SIZE / 2
    const x = Math.max(half, Math.min(bounds.width - half, clientX - bounds.left))
    const y = Math.max(half, Math.min(bounds.height - half, clientY - bounds.top))
    return { x, y }
  }

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!hasMultiple) return
    const delta = direction === 'prev' ? -1 : 1
    const next = (selectedIndex + delta + images.length) % images.length
    onSelect(next)
  }

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!lensActive) return
    setLensPosition(clampLens(event.clientX, event.clientY))
  }

  const handleTouchStart = () => {
    setFullscreenOpen(true)
  }

  const handleModalTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 1) {
      setTouchStartX(event.touches[0].clientX)
    }
  }

  const handleModalTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) return
    const delta = event.changedTouches[0].clientX - touchStartX
    if (Math.abs(delta) > 50) {
      handleNavigate(delta > 0 ? 'prev' : 'next')
    }
    setTouchStartX(null)
  }

  const computedBackground = () => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return { size: '150%', position: '80% 80%' }
    const relativeX = ((lensPosition.x - LENS_SIZE / 2) / (bounds.width - LENS_SIZE)) * 100
    const relativeY = ((lensPosition.y - LENS_SIZE / 2) / (bounds.height - LENS_SIZE)) * 100
    return {
      size: `${ZOOM_SCALE * 100}%`,
      position: `${Number.isFinite(relativeX) ? relativeX : 50}% ${Number.isFinite(relativeY) ? relativeY : 50}%`,
    }
  }

  const { size: zoomSize, position: zoomPosition } = computedBackground()

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (lensActive) {
      document.body.classList.add('lens-open')
    } else {
      document.body.classList.remove('lens-open')
    }
    return () => {
      document.body.classList.remove('lens-open')
    }
  }, [lensActive])

  return (
    <div className="space-y-4">
      <div className="relative lg:flex lg:gap-2">
        <div className="hidden lg:flex flex-col gap-3">
          {images.map((img, idx) => (
            <button
              key={`vertical-${img}-${idx}`}
              type="button"
              onClick={() => onSelect(idx)}
              onMouseEnter={() => onSelect(idx)}
              onFocus={() => onSelect(idx)}
              className={`aspect-square w-24 rounded-2xl border ${
                selectedIndex === idx ? 'border-green-500 ring-2 ring-green-100' : 'border-slate-200'
              } overflow-hidden bg-white`}
            >
              <Image src={img} alt={`Gallery thumbnail ${idx + 1}`} width={120} height={120} className="h-full w-full object-contain p-2" />
            </button>
          ))}
        </div>
        <div className="relative flex-1 w-full lg:max-w-[490px] lg:ml-8 mx-auto">
        <div
          ref={containerRef}
          className="relative w-full aspect-[4/5] max-h-[360px] sm:max-h-[420px] lg:h-[450px] rounded-[32px] border border-[var(--detail-border)] bg-white shadow-sm overflow-hidden group mx-auto"
          onMouseEnter={(event) => {
            setLensActive(true)
            setLensPosition(clampLens(event.clientX, event.clientY))
          }}
          onMouseLeave={() => setLensActive(false)}
          onMouseMove={handleMouseMove}
          onTouchStart={handleTouchStart}
        >
          
          <a
            href={getImageUrlForNewTab(activeImage)}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 z-10"
            onClick={(e) => {
              // Only open in new tab on middle-click or Ctrl/Cmd+click
              // Regular click should not navigate
              if (e.button === 1 || e.ctrlKey || e.metaKey) {
                return; // Allow default behavior
              }
              e.preventDefault()
              e.stopPropagation()
              setFullscreenOpen(true)
            }}
            aria-label="Open image in new tab"
          >
            <Image
              src={activeImage}
              alt="Selected product image"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-contain p-4 lg:p-10 transition-transform duration-300 group-hover:scale-105 pointer-events-none"
              priority
            />
          </a>
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
        <div
          className="pointer-events-none absolute hidden lg:block"
          style={{
            width: LENS_SIZE * 1.3,
            height: LENS_SIZE,
            left: lensPosition.x - (LENS_SIZE * 1.3) / 2,
            top: lensPosition.y - LENS_SIZE / 2,
            borderRadius: '24px',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.4), 0 10px 35px rgba(0,0,0,0.2)',
            backgroundColor: 'rgba(0,0,0,0.18)',
            opacity: lensActive ? 1 : 0,
            transition: 'opacity 120ms ease',
            backdropFilter: 'blur(1px)',
          }}
        >
          <div className="absolute inset-3 rounded-2xl border border-white/60" />
        </div>
        </div>
      {lensActive && (
        <div
          className="hidden lg:block fixed top-[190px] right-[120px] h-[610px] w-[650px] rounded-[32px] border border-[var(--detail-border)] bg-white shadow-4xl overflow-hidden z-[120] pointer-events-none"
          style={{
            backgroundImage: `url("${activeImage}")`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: zoomSize,
            backgroundPosition: zoomPosition,
          }}
        />
      )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 lg:hidden">
        {images.map((img, idx) => (
          <button
            key={`${img}-${idx}`}
            type="button"
            onClick={() => {
              onSelect(idx)
              setFullscreenOpen(true)
            }}
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

      {fullscreenOpen && mounted
        ? createPortal(
          <div className="fixed inset-0 z-[12000] flex flex-col bg-black/90 text-white">
            <div className="flex items-center justify-end px-4 py-3">
              <button
                type="button"
                onClick={() => setFullscreenOpen(false)}
                className="rounded-full border border-white/30 bg-white/10 p-2 hover:bg-white/20"
                aria-label="Close fullscreen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div
              className="relative mx-auto flex w-full max-w-md flex-1 items-center justify-center px-4 pb-6 sm:max-w-3xl"
              onTouchStart={handleModalTouchStart}
              onTouchEnd={handleModalTouchEnd}
            >
              <a
                href={getImageUrlForNewTab(activeImage)}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 z-10"
                onClick={(e) => {
                  // Only open in new tab on middle-click or Ctrl/Cmd+click
                  if (e.button === 1 || e.ctrlKey || e.metaKey) {
                    return;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                  setFullscreenOpen(true)
                }}
                aria-label="Open image in new tab"
              >
                <Image src={activeImage} alt="Fullscreen product image" fill sizes="100vw" className="object-contain pointer-events-none" priority />
              </a>
            </div>
            <div className="flex items-center justify-between px-6 pb-6 sm:px-10">
              <button
                type="button"
                onClick={() => handleNavigate('prev')}
                className="rounded-full border border-white/30 bg-white/10 p-2 hover:bg-white/20"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => handleNavigate('next')}
                className="rounded-full border border-white/30 bg-white/10 p-2 hover:bg-white/20"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>,
          document.body
        )
        : null}
    </div>
  )
}

export default ProductGallery
