'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X, Play, Pause } from 'lucide-react'
import { createPortal } from 'react-dom'
import { getImageUrlForNewTab } from '@/lib/image-utils'

type MediaItem = {
  url: string
  type: 'image' | 'video'
}

type ProductGalleryProps = {
  media: MediaItem[]
  selectedIndex: number
  onSelect: (index: number) => void
  fallback: string
  productTitle?: string
  productPrice?: number
  productHighlights?: string[]
}

const LENS_SIZE = 160
const ZOOM_SCALE = 2.2

// Video Player Component with Play/Pause Button
const VideoPlayer = ({ src, videoRefForZoom }: { src: string; videoRefForZoom: React.RefObject<HTMLVideoElement | null> }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showControls, setShowControls] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)

    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [])

  const togglePlayPause = () => {
    const video = videoRef.current
    if (!video) return
    
    if (video.paused) {
      video.play()
    } else {
      video.pause()
    }
  }

  return (
    <div 
      className="absolute inset-0 flex items-center justify-center bg-black group/video"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        preload="metadata"
        onClick={togglePlayPause}
        onPlay={() => {
          // Sync hidden video for frame capture
          if (videoRefForZoom.current && videoRefForZoom.current.paused) {
            videoRefForZoom.current.currentTime = videoRef.current?.currentTime || 0
            videoRefForZoom.current.play().catch(() => {})
          }
        }}
        onPause={() => {
          // Sync hidden video pause
          if (videoRefForZoom.current && !videoRefForZoom.current.paused) {
            videoRefForZoom.current.pause()
          }
        }}
        onTimeUpdate={() => {
          // Sync time for frame capture
          if (videoRefForZoom.current && videoRef.current) {
            videoRefForZoom.current.currentTime = videoRef.current.currentTime
          }
        }}
      />
      {/* Custom play/pause button overlay - only show when not playing or on hover */}
      {(!isPlaying || showControls) && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            togglePlayPause()
          }}
          className={`absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity z-10 ${
            showControls ? 'opacity-100' : 'opacity-0 group-hover/video:opacity-100'
          }`}
          aria-label={isPlaying ? "Pause video" : "Play video"}
        >
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:bg-white transition-colors">
            {isPlaying ? (
              <Pause className="w-8 h-8 text-slate-700" fill="currentColor" />
            ) : (
              <Play className="w-8 h-8 text-slate-700 ml-1" fill="currentColor" />
            )}
          </div>
        </button>
      )}
    </div>
  )
}

const ProductGallery = ({ media, selectedIndex, onSelect, fallback, productTitle, productPrice, productHighlights }: ProductGalleryProps) => {
  const activeMedia = media[selectedIndex] || { url: fallback, type: 'image' as const }
  const hasMultiple = media.length > 1
  const isVideo = activeMedia.type === 'video'
  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRefForZoom = useRef<HTMLVideoElement | null>(null)
  const [lensActive, setLensActive] = useState(false)
  const [lensPosition, setLensPosition] = useState({ x: LENS_SIZE / 2, y: LENS_SIZE / 2 })
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [touchStartY, setTouchStartY] = useState<number | null>(null)
  const [touchStartTime, setTouchStartTime] = useState<number>(0)
  const [touchHandled, setTouchHandled] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [videoFrameUrl, setVideoFrameUrl] = useState<string | null>(null)
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

  // Capture video frame for magnifying view (works like image zoom)
  useEffect(() => {
    if (!isVideo || !videoRefForZoom.current) {
      setVideoFrameUrl(null)
      return
    }

    const video = videoRefForZoom.current
    const captureFrame = () => {
      try {
        // Only capture if video has valid dimensions
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          return
        }
        
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
          setVideoFrameUrl(dataUrl)
        }
      } catch (error) {
        console.warn('Failed to capture video frame:', error)
      }
    }

    // Capture frame when video metadata is loaded
    const handleLoadedData = () => {
      captureFrame()
    }
    
    const handleTimeUpdate = () => {
      // Update frame periodically to show current video frame in magnifying view
      if (lensActive) {
        captureFrame()
      }
    }

    if (video.readyState >= 2) {
      captureFrame()
    } else {
      video.addEventListener('loadeddata', handleLoadedData, { once: true })
    }
    
    video.addEventListener('timeupdate', handleTimeUpdate)

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData)
      video.removeEventListener('timeupdate', handleTimeUpdate)
    }
  }, [isVideo, activeMedia.url, selectedIndex, lensActive])

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
    const next = (selectedIndex + delta + media.length) % media.length
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
    <div className="space-y-4">
      <div className="relative lg:flex lg:gap-2">
        <div className="hidden lg:flex flex-col gap-3">
          {media.map((item, idx) => (
            <button
              key={`vertical-${item.url}-${idx}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSelect(idx)
              }}
              onMouseEnter={() => onSelect(idx)}
              onFocus={() => onSelect(idx)}
              className={`aspect-square w-24 rounded-2xl border ${
                selectedIndex === idx ? 'border-green-500 ring-2 ring-green-100' : 'border-slate-200'
              } overflow-hidden bg-white`}
            >
              {item.type === 'video' ? (
                <>
                  <video
                    src={item.url}
                    className="h-full w-full object-cover"
                    muted
                    preload="metadata"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                      <svg className="w-5 h-5 text-slate-700 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </>
              ) : (
                <Image src={item.url} alt={`Gallery thumbnail ${idx + 1}`} width={120} height={120} className="h-full w-full object-contain p-2" />
              )}
            </button>
          ))}
        </div>
        <div className="relative flex-1 w-full lg:max-w-[490px] lg:ml-3 mx-auto">
        <div
          ref={containerRef}
          className="relative w-full aspect-[4/5] max-h-[360px] sm:max-h-[420px] lg:h-[450px] rounded-[32px] border border-[var(--detail-border)] bg-white shadow-sm overflow-hidden group mx-auto"
          onMouseEnter={(event) => {
            // Activate lens for both images and videos
            setLensActive(true)
            setLensPosition(clampLens(event.clientX, event.clientY))
          }}
          onMouseLeave={() => setLensActive(false)}
          onMouseMove={handleMouseMove}
          onTouchStart={handleMainImageTouchStart}
          onTouchEnd={handleMainImageTouchEnd}
        >
          
          {isVideo ? (
            <>
              <VideoPlayer 
                src={activeMedia.url}
                videoRefForZoom={videoRefForZoom}
              />
              {/* Hidden video element to capture frames for magnifying view */}
              <video
                ref={videoRefForZoom}
                src={activeMedia.url}
                className="hidden"
                preload="metadata"
                muted
                playsInline
              />
            </>
          ) : (
            <a
              href={getImageUrlForNewTab(activeMedia.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute inset-0 z-10"
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
                src={activeMedia.url}
                alt="Selected product image"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain p-4 lg:p-10 transition-transform duration-300 group-hover:scale-105 pointer-events-none"
                priority
              />
            </a>
          )}
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
        {lensActive && containerRef.current && (
          <div
            className="hidden lg:block fixed h-[500px] w-[500px] rounded-[32px] border-2 border-green-500/30 bg-white shadow-2xl overflow-hidden z-[120] pointer-events-none"
            style={{
              backgroundImage: isVideo && videoFrameUrl 
                ? `url("${videoFrameUrl}")` 
                : `url("${activeMedia.url}")`,
              top: `${containerRef.current.getBoundingClientRect().top}px`,
              left: `${containerRef.current.getBoundingClientRect().right + 24}px`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: zoomSize,
              backgroundPosition: zoomPosition,
            }}
          />
        )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 lg:hidden">
        {media.map((item, idx) => (
          <button
            key={`${item.url}-${idx}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(idx)
            }}
            onMouseEnter={() => onSelect(idx)}
            onFocus={() => onSelect(idx)}
            className={`aspect-square rounded-2xl border ${
              selectedIndex === idx ? 'border-green-500 ring-2 ring-green-100' : 'border-slate-200'
            } overflow-hidden bg-white`}
          >
            {item.type === 'video' ? (
              <>
                <video
                  src={item.url}
                  className="h-full w-full object-cover"
                  muted
                  preload="metadata"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                    <svg className="w-5 h-5 text-slate-700 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <Image src={item.url} alt={`Gallery thumbnail ${idx + 1}`} width={200} height={200} className="object-contain w-full h-full p-2" />
            )}
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
                {/* Zoom Controls - Desktop Only (for images) */}
                {!isVideo && (
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
                )}

                {/* Main Media Container */}
                <div className="md:flex-1 relative bg-white overflow-hidden">
                  <div
                    className="relative md:absolute md:inset-0 w-full aspect-square md:aspect-auto md:h-full transition-transform duration-200 ease-out origin-center"
                    style={!isVideo ? { transform: `scale(${zoomLevel})` } : {}}
                    onTouchStart={handleModalTouchStart}
                    onTouchEnd={handleModalTouchEnd}
                  >
                    {isVideo ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black">
                        <video
                          src={activeMedia.url}
                          controls
                          className="w-full h-full object-contain"
                          preload="metadata"
                          autoPlay
                        />
                      </div>
                    ) : (
                      <a
                        href={getImageUrlForNewTab(activeMedia.url)}
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
                        }}
                        aria-label="Open image in new tab"
                      >
                        <Image
                          src={activeMedia.url}
                          alt="Product preview"
                          fill
                          sizes="(max-width: 768px) 100vw, 65vw"
                          className="object-contain p-4 md:p-8 lg:p-12 pointer-events-none"
                          priority
                        />
                      </a>
                    )}
                  </div>

                  {/* Navigation Arrows - Desktop Only */}
                  {hasMultiple && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNavigate('prev')
                          resetZoom()
                        }}
                        className="hidden md:flex absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white hover:bg-gray-50 shadow-lg border border-gray-200 items-center justify-center transition-all hover:scale-110 z-20"
                        aria-label="Previous image"
                      >
                        <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNavigate('next')
                          resetZoom()
                        }}
                        className="hidden md:flex absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white hover:bg-gray-50 shadow-lg border border-gray-200 items-center justify-center transition-all hover:scale-110 z-20"
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
                    {media.map((item, idx) => (
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
                        {item.type === 'video' ? (
                          <>
                            <video
                              src={item.url}
                              className="h-full w-full object-cover"
                              muted
                              preload="metadata"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                                <svg className="w-5 h-5 text-slate-700 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          </>
                        ) : (
                          <Image
                            src={item.url}
                            alt={`${idx + 1}`}
                            width={200}
                            height={200}
                            className="w-full h-full object-contain p-2 bg-white"
                          />
                        )}
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
                    {media.map((item, idx) => (
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
                        {item.type === 'video' ? (
                          <>
                            <video
                              src={item.url}
                              className="h-full w-full object-cover"
                              muted
                              preload="metadata"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <div className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center">
                                <svg className="w-4 h-4 text-slate-700 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          </>
                        ) : (
                          <Image
                            src={item.url}
                            alt={`${idx + 1}`}
                            width={80}
                            height={80}
                            className="w-full h-full object-contain p-0.5 md:p-1 bg-white"
                          />
                        )}
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
