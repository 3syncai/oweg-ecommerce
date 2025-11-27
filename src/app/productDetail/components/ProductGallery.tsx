'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X, Plus } from 'lucide-react'
import { createPortal } from 'react-dom'
import { getImageUrlForNewTab } from '@/lib/image-utils'

type ProductGalleryProps = {
  images: string[]
  selectedIndex: number
  onSelect: (index: number) => void
  fallback: string
  productTitle?: string
  productPrice?: number
  productHighlights?: string[]
}

const LENS_SIZE = 160
const ZOOM_SCALE = 2.2

const ProductGallery = ({ images, selectedIndex, onSelect, fallback, productTitle, productPrice, productHighlights }: ProductGalleryProps) => {
  const activeImage = images[selectedIndex] || fallback
  const hasMultiple = images.length > 1
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [lensActive, setLensActive] = useState(false)
  const [lensPosition, setLensPosition] = useState({ x: LENS_SIZE / 2, y: LENS_SIZE / 2 })
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [touchStartY, setTouchStartY] = useState<number | null>(null)
  const [touchStartTime, setTouchStartTime] = useState<number>(0)
  const [touchHandled, setTouchHandled] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
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

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreenOpen) {
        setFullscreenOpen(false)
      }
    }
    window.addEventListener('keydown', handleEscKey)
    return () => window.removeEventListener('keydown', handleEscKey)
  }, [fullscreenOpen])

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

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 4))
  }

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.5, 1))
  }

  const resetZoom = () => {
    setZoomLevel(1)
  }

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!lensActive) return
    setLensPosition(clampLens(event.clientX, event.clientY))
  }

  const handleOpenFullscreen = () => {
    resetZoom()
    setFullscreenOpen(true)
  }

  // Touch handlers for main image swipe
  const handleMainImageTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setTouchStartX(e.touches[0].clientX)
      setTouchStartY(e.touches[0].clientY)
      setTouchStartTime(Date.now())
    }
  }

  const handleMainImageTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return

    const touchEndX = e.changedTouches[0].clientX
    const touchEndY = e.changedTouches[0].clientY
    const touchEndTime = Date.now()

    const deltaX = touchEndX - touchStartX
    const deltaY = touchEndY - touchStartY
    const deltaTime = touchEndTime - touchStartTime

    // Check if it's a swipe (horizontal movement > vertical movement)
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50

    // Check if it's a quick tap (< 300ms and < 10px movement)
    const isTap = deltaTime < 300 && Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10

    if (isHorizontalSwipe && hasMultiple) {
      // Swipe detected - navigate images
      e.preventDefault()
      e.stopPropagation()
      setTouchHandled(true)
      if (deltaX > 0) {
        handleNavigate('prev') // Swipe right = previous
      } else {
        handleNavigate('next') // Swipe left = next
      }
      setTimeout(() => setTouchHandled(false), 100)
    } else if (isTap) {
      // Tap detected - open gallery
      setTouchHandled(true)
      handleOpenFullscreen()
      setTimeout(() => setTouchHandled(false), 100)
    }

    setTouchStartX(null)
    setTouchStartY(null)
    setTouchStartTime(0)
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
    <div className="space-y-3">
      <div className="relative lg:flex lg:gap-1.5">
        <div className="hidden lg:flex flex-col gap-1.5 overflow-y-auto max-h-[450px] pr-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
          {images.map((img, idx) => (
            <button
              key={`vertical-${img}-${idx}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSelect(idx)
              }}
              onMouseEnter={() => onSelect(idx)}
              onFocus={() => onSelect(idx)}
              className={`aspect-square w-12 flex-shrink-0 rounded-md border overflow-hidden bg-white transition-all ${
                selectedIndex === idx ? 'border-2 border-green-500 ring-1 ring-green-100' : 'border border-slate-300 hover:border-slate-400'
              }`}
            >
              <Image src={img} alt={`${idx + 1}`} width={48} height={48} className="h-full w-full object-contain p-0.5" />
            </button>
          ))}
        </div>
        <div className="relative flex-1 w-full lg:max-w-[490px] lg:ml-3 mx-auto">
        <div
          ref={containerRef}
          className="relative w-full aspect-[4/5] max-h-[360px] sm:max-h-[420px] lg:h-[450px] rounded-[32px] border border-[var(--detail-border)] bg-white shadow-sm overflow-hidden group mx-auto"
          onMouseEnter={(event) => {
            setLensActive(true)
            setLensPosition(clampLens(event.clientX, event.clientY))
          }}
          onMouseLeave={() => setLensActive(false)}
          onMouseMove={handleMouseMove}
          onTouchStart={handleMainImageTouchStart}
          onTouchEnd={handleMainImageTouchEnd}
        >
          
          <div
            className="absolute inset-0 z-10 cursor-pointer lg:cursor-zoom-in"
            onClick={(e) => {
              // Prevent if touch was just handled
              if (touchHandled) {
                e.preventDefault()
                return
              }
              // Handle desktop mouse clicks only (touch is handled by touch handlers)
              e.preventDefault()
              e.stopPropagation()
              handleOpenFullscreen()
            }}
          >
            <Image
              src={activeImage}
              alt="Selected product image"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-contain p-4 lg:p-10 transition-transform duration-300 group-hover:scale-105 pointer-events-none"
              priority
            />
          </div>
          {hasMultiple && (
            <div className="absolute inset-x-0 bottom-4 flex justify-between px-4 z-20">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleNavigate('prev')
                }}
                className="w-10 h-10 rounded-full bg-white/90 text-slate-700 flex items-center justify-center shadow border border-slate-100 hover:bg-white transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleNavigate('next')
                }}
                className="w-10 h-10 rounded-full bg-white/90 text-slate-700 flex items-center justify-center shadow border border-slate-100 hover:bg-white transition"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        <div
          className="pointer-events-none absolute hidden lg:block z-20"
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
      {lensActive && containerRef.current && (
        <div
          className="hidden lg:block fixed h-[500px] w-[500px] rounded-[32px] border-2 border-green-500/30 bg-white shadow-2xl overflow-hidden z-[120] pointer-events-none"
          style={{
            top: `${containerRef.current.getBoundingClientRect().top}px`,
            left: `${containerRef.current.getBoundingClientRect().right + 24}px`,
            backgroundImage: `url("${activeImage}")`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: zoomSize,
            backgroundPosition: zoomPosition,
          }}
        />
      )}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto lg:hidden scrollbar-hide">
        {images.map((img, idx) => (
          <button
            key={`${img}-${idx}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(idx)
            }}
            onMouseEnter={() => onSelect(idx)}
            onFocus={() => onSelect(idx)}
            className={`flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-md border overflow-hidden bg-white transition-all ${
              selectedIndex === idx ? 'border-2 border-green-500 ring-1 ring-green-100' : 'border border-slate-300'
            }`}
          >
            <Image src={img} alt={`${idx + 1}`} width={56} height={56} className="object-contain w-full h-full p-0.5 sm:p-1" />
          </button>
        ))}
      </div>

      {fullscreenOpen && mounted
        ? createPortal(
          <div
            className="fixed inset-0 z-[12000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
            onClick={() => setFullscreenOpen(false)}
          >
            {/* Main Modal Container */}
            <div
              className="relative bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] sm:max-h-[90vh] flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button - Top Right */}
              <button
                type="button"
                onClick={() => setFullscreenOpen(false)}
                className="absolute top-2 right-2 sm:top-4 sm:right-4 z-50 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-gray-100 shadow-lg flex items-center justify-center transition-all hover:scale-110"
                aria-label="Close"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
              </button>

              {/* Left Side - Main Image Preview */}
              <div className="flex-1 flex flex-col bg-gray-50 overflow-y-auto">
                {/* Zoom Controls - Desktop Only */}
                <div className="hidden md:flex items-center justify-center gap-2 sm:gap-3 py-2 sm:py-3 bg-white border-b border-gray-200 relative z-50">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    disabled={zoomLevel <= 1}
                    className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition"
                    aria-label="Zoom out"
                    title="Zoom out"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="8" strokeWidth="2"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M8 11h6"/>
                    </svg>
                  </button>
                  <span className="text-xs sm:text-sm font-medium text-gray-600 min-w-[50px] sm:min-w-[60px] text-center">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={zoomLevel >= 4}
                    className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition"
                    aria-label="Zoom in"
                    title="Zoom in"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="8" strokeWidth="2"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
                    </svg>
                  </button>
                </div>

                {/* Main Image Container - Full Width on Mobile */}
                <div className="md:flex-1 relative bg-white overflow-hidden">
                  <div
                    className="relative md:absolute md:inset-0 w-full aspect-square md:aspect-auto md:h-full transition-transform duration-200 ease-out origin-center"
                    style={{
                      transform: `scale(${zoomLevel})`,
                    }}
                    onTouchStart={handleModalTouchStart}
                    onTouchEnd={handleModalTouchEnd}
                  >
                    <Image
                      src={activeImage}
                      alt="Product preview"
                      fill
                      sizes="(max-width: 768px) 100vw, 65vw"
                      className="object-contain p-4 md:p-8 lg:p-12 pointer-events-none"
                      priority
                    />
                  </div>

                  {/* Navigation Arrows - Desktop Only */}
                  {hasMultiple && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNavigate('prev')
                        }}
                        className="hidden md:flex absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white hover:bg-gray-50 shadow-lg border border-gray-200 items-center justify-center transition-all hover:scale-110"
                        aria-label="Previous image"
                      >
                        <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNavigate('next')
                        }}
                        className="hidden md:flex absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white hover:bg-gray-50 shadow-lg border border-gray-200 items-center justify-center transition-all hover:scale-110"
                        aria-label="Next image"
                      >
                        <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                      </button>
                    </>
                  )}
                </div>

                {/* Mobile Thumbnail Grid - 2 Columns */}
                <div className="md:hidden bg-white p-3">
                  <div className="grid grid-cols-2 gap-2">
                    {images.map((img, idx) => (
                      <button
                        key={`mobile-thumb-${idx}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelect(idx)
                          resetZoom()
                        }}
                        className={`aspect-square rounded-lg border overflow-hidden transition-all ${
                          selectedIndex === idx
                            ? 'border-2 border-green-500 ring-2 ring-green-200'
                            : 'border border-gray-300'
                        }`}
                      >
                        <Image
                          src={img}
                          alt={`${idx + 1}`}
                          width={200}
                          height={200}
                          className="w-full h-full object-contain p-2 bg-white"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Sidebar - Product Info & Thumbnails (Desktop) */}
              <div className="hidden md:flex w-80 lg:w-96 flex-col bg-white border-l border-gray-200">
                {/* Product Mini Info */}
                {productTitle && (
                  <div className="p-4 md:p-5 lg:p-6 border-b border-gray-200">
                    <h2 className="text-sm md:text-base lg:text-lg font-medium text-gray-900 mb-2 line-clamp-2 leading-snug">
                      {productTitle}
                    </h2>
                    {productPrice && (
                      <p className="text-xl md:text-2xl lg:text-3xl font-semibold text-gray-900 mb-3">
                        ₹{productPrice.toLocaleString('en-IN')}
                      </p>
                    )}
                    {productHighlights && productHighlights.length > 0 && (
                      <div className="space-y-1.5 md:space-y-2">
                        {productHighlights.slice(0, 3).map((highlight, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                            <span className="text-[10px] md:text-xs lg:text-sm text-gray-600 leading-relaxed">{highlight}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Vertical Thumbnail Gallery */}
                <div className="flex-1 overflow-y-auto p-2 md:p-3">
                  <div className="grid grid-cols-3 gap-1 md:gap-1.5">
                    {images.map((img, idx) => (
                      <button
                        key={`sidebar-thumb-${idx}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelect(idx)
                          resetZoom()
                        }}
                        className={`aspect-square rounded border overflow-hidden transition-all ${
                          selectedIndex === idx
                            ? 'border-2 border-orange-500 ring-1 ring-orange-200'
                            : 'border border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <Image
                          src={img}
                          alt={`${idx + 1}`}
                          width={80}
                          height={80}
                          className="w-full h-full object-contain p-0.5 md:p-1 bg-white"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
        : null}
    </div>
  )
}

export default ProductGallery
