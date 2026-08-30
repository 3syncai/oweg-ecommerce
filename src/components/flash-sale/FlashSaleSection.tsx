'use client'

import React, { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Megaphone } from 'lucide-react'
import { Heart } from 'lucide-react'
import axios from 'axios'
import { useAuth } from '@/contexts/AuthProvider'
import { useAddToWishlistWithNotification } from '@/hooks/useWishlistMutations'
import { ProductCardQuickActions } from '@/components/modules/ProductCardQuickActions'

type FlashSaleProduct = {
  id: string
  title: string
  thumbnail?: string | null
  images?: Array<{ url: string }> | null
  variants?: Array<{
    id?: string
    prices?: Array<{
      amount: number
      currency_code: string
    }>
  }> | null
  metadata?: {
    mrp?: number
    price?: number
  }
  variant_id?: string
  flash_sale_price?: number // Flash sale price in rupees
  original_price?: number // Original price in rupees
  flash_sale?: {
    expires_at: string
    time_remaining_ms: number
  }
}

type FlashSaleData = {
  active: boolean
  flash_sale: {
    expires_at: string | null
    time_remaining_ms: number
    item_count: number
  } | null
  products: FlashSaleProduct[]
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
})

const FlashSaleSection: React.FC = () => {
  const [flashSaleData, setFlashSaleData] = useState<FlashSaleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchFlashSale()
    const interval = setInterval(fetchFlashSale, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!flashSaleData?.flash_sale?.expires_at) {
      setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 })
      return
    }
    
    const expiresAt = flashSaleData.flash_sale.expires_at
    
    const updateTimer = () => {
      const now = Date.now()
      const endTime = new Date(expiresAt).getTime()
      const remaining = Math.max(0, endTime - now)
      if (remaining > 0) {
        updateCountdown(remaining)
      } else {
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        // Refresh data when expired
        fetchFlashSale()
      }
    }
    
    // Initial update
    updateTimer()
    
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [flashSaleData?.flash_sale?.expires_at])

  const fetchFlashSale = async () => {
    try {
      const response = await axios.get('/api/medusa/flash-sale/products', {
        headers: {
          'Cache-Control': 'no-store',
        },
      })
      
      if (response.status === 200) {
        setFlashSaleData(response.data)
      } else {
        setFlashSaleData({ active: false, flash_sale: null, products: [] })
      }
    } catch (error) {
      console.error('[FlashSaleSection] Failed to fetch flash sale:', error)
      setFlashSaleData({ active: false, flash_sale: null, products: [] })
    } finally {
      setLoading(false)
    }
  }

  const updateCountdown = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    setTimeRemaining({ days, hours, minutes, seconds })
  }

  const scrollByPage = (direction: -1 | 1) => {
    const node = scrollRef.current
    if (!node) return
    const amount = Math.max(200, Math.round(node.clientWidth * 0.8))
    node.scrollBy({ left: direction * amount, behavior: 'smooth' })
  }

  const scrollLeft = () => scrollByPage(-1)

  const scrollRight = () => scrollByPage(1)

  if (loading) {
    return null
  }

  if (!flashSaleData?.active || !flashSaleData?.flash_sale || !flashSaleData?.products || flashSaleData.products.length === 0) {
    return null
  }

  return (
    <section className="oweg-section-tight">
      <div className="oweg-container">
        <div className="oweg-section-head">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="inline-flex items-center gap-2">
              <Megaphone className="h-5 w-5 shrink-0 text-pink-500 md:h-6 md:w-6" />
              <h2 className="oweg-title">FLASH SALE</h2>
            </span>
            {/* Countdown Timer */}
            <div className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 font-mono text-sm font-semibold tabular-nums text-[var(--oweg-ink-soft)] ring-1 ring-[var(--oweg-border)] md:text-base">
              <span>{String(timeRemaining.days).padStart(1, '0')}</span>
              <span className="text-[var(--oweg-ink-muted)]">:</span>
              <span>{String(timeRemaining.hours).padStart(2, '0')}</span>
              <span className="text-[var(--oweg-ink-muted)]">:</span>
              <span>{String(timeRemaining.minutes).padStart(2, '0')}</span>
              <span className="text-[var(--oweg-ink-muted)]">:</span>
              <span>{String(timeRemaining.seconds).padStart(2, '0')}</span>
            </div>
          </div>
          <div className="hidden shrink-0 gap-2 sm:flex">
            <button
              type="button"
              onClick={scrollLeft}
              className="oweg-rail-btn"
              aria-label="Scroll flash sale left"
            >
              <ChevronLeft className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              onClick={scrollRight}
              className="oweg-rail-btn"
              aria-label="Scroll flash sale right"
            >
              <ChevronRight className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="oweg-rail oweg-rail-bleed scrollbar-hidden"
          role="region"
          aria-label="Flash Sale product carousel"
        >
          {flashSaleData.products.map((product) => (
            <FlashSaleProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  )
}

// Flash Sale Product Card Component (matching ProductCard design)
function FlashSaleProductCard({ product }: { product: FlashSaleProduct }) {
  const [isHovered, setIsHovered] = useState(false)
  const { customer } = useAuth()
  const { addToWishlist, isLoading: isAddingToWishlist } = useAddToWishlistWithNotification(product.id)

  // Get variant_id from product
  const variantId = product.variant_id || product.variants?.[0]?.id || null

  // Defensive coercion: Postgres NUMERIC columns serialize as strings
  // ("900.00"), so `flash_sale_price` / `original_price` may arrive as
  // strings depending on upstream. We must always return real numbers,
  // otherwise `mrp > price` does a *string* comparison ("1000" < "900" by
  // first-char) and the discount badge silently reads 0%.
  const toNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value)
      return Number.isFinite(n) ? n : 0
    }
    return 0
  }

  const calculatePrice = () => {
    if (product.flash_sale_price !== undefined && product.flash_sale_price !== null) {
      return toNumber(product.flash_sale_price)
    }
    if (product.metadata?.price) {
      return toNumber(product.metadata.price)
    }
    const variant = product.variants?.[0]
    const price = variant?.prices?.[0]?.amount
    if (price) {
      return toNumber(price) / 100 // Convert from cents
    }
    return 0
  }

  const calculateMRP = () => {
    if (product.original_price !== undefined && product.original_price !== null) {
      return toNumber(product.original_price)
    }
    if (product.metadata?.mrp) {
      return toNumber(product.metadata.mrp)
    }
    return calculatePrice()
  }

  const calculateDiscount = () => {
    const mrp = calculateMRP()
    const price = calculatePrice()
    if (mrp > price && mrp > 0) {
      return Math.round(((mrp - price) / mrp) * 100)
    }
    return 0
  }

  const getProductImage = () => {
    if (product.thumbnail) return product.thumbnail
    if (product.images && product.images.length > 0) {
      return product.images[0].url
    }
    return '/placeholder-product.png'
  }

  const price = calculatePrice()
  const mrp = calculateMRP()
  const discount = calculateDiscount()
  const imageUrl = getProductImage()
  const productHref = `/productDetail/${encodeURIComponent(product.id)}`

  const isWishlisted = (() => {
    const list = (customer?.metadata as Record<string, unknown> | undefined)?.wishlist
    if (!Array.isArray(list)) return false
    return list.map((itemId) => String(itemId)).includes(String(product.id))
  })()

  const handleWishlist = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    await addToWishlist(product.id)
  }

  return (
    <div className="oweg-rail-item">
      <Link
        href={productHref}
        className="group relative flex h-full w-full flex-col overflow-visible rounded-[var(--oweg-radius-lg)] border border-[var(--oweg-border)] bg-white shadow-[var(--oweg-shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--oweg-green)] hover:shadow-[var(--oweg-shadow-md)]"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative aspect-square overflow-visible rounded-t-[var(--oweg-radius-lg)] bg-[var(--oweg-surface-subtle)]">
          <div className="absolute inset-0 overflow-hidden rounded-t-[var(--oweg-radius-lg)]">
            <Image
              src={imageUrl}
              alt={product.title}
              fill
              className="object-contain p-3 transition-transform duration-300 ease-out group-hover:scale-[1.04]"
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw"
            />
          </div>
          <ProductCardQuickActions
            variantId={variantId ?? undefined}
            productName={product.title}
            isHovered={isHovered}
          >
            <button
              type="button"
              onClick={handleWishlist}
              title="Add to Wishlist"
              disabled={isAddingToWishlist}
              className={`w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-lg border hover:text-red-500 transition ${
                isWishlisted ? "text-red-500 border-red-200" : "text-gray-700"
              } ${isAddingToWishlist ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <Heart className="w-4 h-4" fill={isWishlisted ? "currentColor" : "none"} />
            </button>
          </ProductCardQuickActions>
        </div>
        <div className="flex flex-1 flex-col p-2.5 sm:p-3">
          <div className="mb-2 flex flex-wrap items-start gap-1.5">
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              {discount}% off
            </span>
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
              Limited
            </span>
          </div>
          <p className="mb-2 line-clamp-2 flex-1 text-[13px] leading-snug text-[var(--oweg-ink-soft)] sm:text-sm">
            {product.title}
          </p>
          <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-base font-bold text-[var(--oweg-ink)] sm:text-lg">
              {inr.format(price)}
            </span>
            <span className="text-xs text-[var(--oweg-ink-muted)] line-through">{inr.format(mrp)}</span>
          </div>
        </div>
      </Link>
    </div>
  )
}

export default FlashSaleSection
