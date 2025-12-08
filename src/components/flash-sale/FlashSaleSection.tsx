'use client'

import React, { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Megaphone } from 'lucide-react'
import { Heart } from 'lucide-react'
import axios from 'axios'
import { useAuth } from '@/contexts/AuthProvider'
import { useAddToCartWithNotification } from '@/hooks/useCartMutations'
import { useAddToWishlistWithNotification } from '@/hooks/useWishlistMutations'

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

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -220, behavior: 'smooth' })
    }
  }

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 220, behavior: 'smooth' })
    }
  }

  if (loading) {
    return null
  }

  if (!flashSaleData?.active || !flashSaleData?.flash_sale || !flashSaleData?.products || flashSaleData.products.length === 0) {
    return null
  }

  return (
    <div className="mb-8 px-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 md:w-6 md:h-6 text-pink-500" />
            <h2 className="text-2xl font-bold text-gray-900 transition-all duration-300 hover:text-green-600">
              FLASH SALE
            </h2>
          </div>
          {/* Countdown Timer - Matching image style */}
          <div className="flex items-center gap-1 text-base md:text-lg font-semibold text-gray-700">
            <span className="font-mono">
              {String(timeRemaining.days).padStart(1, '0')}
            </span>
            <span className="text-gray-600">:</span>
            <span className="font-mono">
              {String(timeRemaining.hours).padStart(2, '0')}
            </span>
            <span className="text-gray-600">:</span>
            <span className="font-mono">
              {String(timeRemaining.minutes).padStart(2, '0')}
            </span>
            <span className="text-gray-600">:</span>
            <span className="font-mono">
              {String(timeRemaining.seconds).padStart(2, '0')}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={scrollLeft}
            className="w-8 h-8 rounded-full bg-white border border-gray-300 flex items-center justify-center hover:bg-gray-50 hover:border-green-500 transition-all duration-300 hover:scale-110"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={scrollRight}
            className="w-8 h-8 rounded-full bg-white border border-gray-300 flex items-center justify-center hover:bg-gray-50 hover:border-green-500 transition-all duration-300 hover:scale-110"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hidden pb-4 scroll-smooth snap-x snap-mandatory"
        role="region"
        aria-label="Flash Sale product carousel"
      >
        {flashSaleData.products.map((product) => (
          <FlashSaleProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  )
}

// Flash Sale Product Card Component (matching ProductCard design)
function FlashSaleProductCard({ product }: { product: FlashSaleProduct }) {
  const [isHovered, setIsHovered] = useState(false)
  const { customer } = useAuth()
  const { addToCart, isLoading: isAddingToCart } = useAddToCartWithNotification(product.title)
  const { addToWishlist, isLoading: isAddingToWishlist } = useAddToWishlistWithNotification(product.id)

  // Get variant_id from product
  const variantId = product.variant_id || product.variants?.[0]?.id || null

  const calculatePrice = () => {
    if (product.flash_sale_price !== undefined) {
      return product.flash_sale_price
    }
    if (product.metadata?.price) {
      return product.metadata.price
    }
    const variant = product.variants?.[0]
    const price = variant?.prices?.[0]?.amount
    if (price) {
      return price / 100 // Convert from cents
    }
    return 0
  }

  const calculateMRP = () => {
    if (product.original_price !== undefined) {
      return product.original_price
    }
    if (product.metadata?.mrp) {
      return product.metadata.mrp
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

  const handleQuickAdd = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!variantId) return
    await addToCart(variantId)
  }

  const handleWishlist = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    await addToWishlist(product.id)
  }

  return (
    <div className="flex-shrink-0 w-[200px] sm:w-[220px] md:w-[260px] lg:w-[300px]">
      <Link
        href={productHref}
        className="group relative w-full bg-white rounded-lg overflow-visible shadow-sm hover:shadow-xl transition-all duration-300 hover:border-[#7AC943] border border-gray-200 flex flex-col h-full"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative aspect-square bg-gray-50 overflow-visible rounded-t-lg">
          <div className="absolute inset-0 overflow-hidden rounded-t-lg">
            <Image
              src={imageUrl}
              alt={product.title}
              fill
              className="object-contain p-3"
              sizes="(max-width: 640px) 200px, (max-width: 1024px) 220px, 260px"
            />
          </div>
          <div
            className={`absolute top-2 right-2 flex flex-col gap-2 z-30 transition-all duration-300 ${
              isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"
            }`}
            style={{ pointerEvents: isHovered ? "auto" : "none" }}
          >
            <button
              type="button"
              onClick={handleQuickAdd}
              title="Add to Cart"
              disabled={!variantId || isAddingToCart}
              className={`w-9 h-9 rounded-full text-white flex items-center justify-center shadow-lg ${
                variantId
                  ? "bg-green-500 hover:bg-green-600"
                  : "bg-slate-400 cursor-not-allowed opacity-70"
              } ${isAddingToCart ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              +
            </button>
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
          </div>
        </div>
        <div className="p-3 flex flex-col flex-1">
          <div className="flex items-start gap-2 mb-2">
            <span className="bg-red-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
              {discount}% off
            </span>
            <span className="bg-red-100 text-red-700 text-[11px] font-medium px-2 py-0.5 rounded-full">
              Limited
            </span>
          </div>
          <p className="text-sm text-gray-700 line-clamp-2 flex-1 mb-2">{product.title}</p>
          <div className="mt-auto">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-gray-900">{inr.format(price)}</span>
              <span className="text-xs text-gray-500 line-through">
                M.R.P: {inr.format(mrp)}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}

export default FlashSaleSection
