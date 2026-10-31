'use client'

import React, { useCallback, useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Zap, ArrowRight } from 'lucide-react'
import { Heart, ImageOff } from 'lucide-react'
import axios from 'axios'
import { useAuth } from '@/contexts/AuthProvider'
import { useAddToWishlistWithNotification } from '@/hooks/useWishlistMutations'
import { ProductCardQuickActions } from '@/components/modules/ProductCardQuickActions'
import styles from './FlashSaleSection.module.css'
import { flashSaleCountdown, flashSaleTimerUnits, flashSaleTitle } from '@/lib/flash-sale-display'

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
  display_pricing?: { variant_id: string; price: number; mrp: number; from: boolean }
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
    title?: string | null
    expires_at: string | null
    time_remaining_ms: number
    item_count: number
  } | null
  products: FlashSaleProduct[]
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const FlashSaleSection: React.FC<{ showImageFallback?: boolean; inStockOnly?: boolean; view?: 'carousel' | 'all' }> = ({ showImageFallback = false, inStockOnly = false, view = 'carousel' }) => {
  const [flashSaleData, setFlashSaleData] = useState<FlashSaleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [failed, setFailed] = useState(false)
  const fetching = useRef(false)
  const refreshedExpiry = useRef<string | null>(null)

  const fetchFlashSale = useCallback(async () => {
    if (fetching.current || document.visibilityState === 'hidden') return
    fetching.current = true
    try {
      const query = new URLSearchParams()
      if (inStockOnly) query.set('in_stock', '1')
      if (view === 'all') query.set('all', '1')
      const response = await axios.get(`/api/medusa/flash-sale/products${query.size ? `?${query}` : ''}`)
      setFailed(response.status !== 200 || response.data?.unavailable === true)
      setFlashSaleData(response.status === 200 ? response.data : { active: false, flash_sale: null, products: [] })
    } catch {
      setFailed(true)
      setFlashSaleData({ active: false, flash_sale: null, products: [] })
    } finally {
      fetching.current = false
      setLoading(false)
    }
  }, [inStockOnly, view])

  useEffect(() => {
    void fetchFlashSale()
    const interval = setInterval(() => { void fetchFlashSale() }, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchFlashSale() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [fetchFlashSale])

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
        // One request per expiry; regular minute polling handles retries.
        if (refreshedExpiry.current !== expiresAt && document.visibilityState !== 'hidden') {
          refreshedExpiry.current = expiresAt
          void fetchFlashSale()
        }
      }
    }
    
    // Initial update
    updateTimer()
    
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [flashSaleData?.flash_sale?.expires_at, fetchFlashSale])

  const updateCountdown = (ms: number) => {
    setTimeRemaining(flashSaleCountdown(ms))
  }

  if (loading) {
    return view === 'all' ? <div className="oweg-container" role="status"><p>Loading flash sale deals…</p><div className={styles.grid} aria-hidden="true">{Array.from({length: 8}, (_, i) => <div key={i} className={styles.skeleton} />)}</div></div> : null
  }

  if (!flashSaleData?.active || !flashSaleData?.flash_sale || !flashSaleData?.products || flashSaleData.products.length === 0) {
    return view === 'all' ? <div className="oweg-container space-y-4 py-10">
      <h1 className="oweg-title">Flash sale deals</h1>
      <p role={failed ? 'alert' : 'status'}>{failed ? 'Deals couldn’t load. Please try again.' : 'There are no active in-stock deals right now. Check back soon.'}</p>
      {failed && <button type="button" className={styles.browse} onClick={() => void fetchFlashSale()}>Try again</button>}
      <Link href="/" className="underline">Back to shopping</Link>
    </div> : null
  }

  return <FlashSaleShowcase data={flashSaleData} timeRemaining={timeRemaining} showImageFallback={showImageFallback} view={view} />
}

/** Presentation is separate from polling so real data and preview fixtures use the same layout. */
export function FlashSaleShowcase({ data, timeRemaining, showImageFallback = false, view = 'carousel' }: {
  data: FlashSaleData;
  timeRemaining: { days: number; hours: number; minutes: number; seconds: number };
  showImageFallback?: boolean;
  view?: 'carousel' | 'all';
}) {
  const title = flashSaleTitle(data.flash_sale?.title)
  const units = flashSaleTimerUnits(timeRemaining)
  const Heading = view === 'all' ? 'h1' : 'h2'
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollByPage = (direction: -1 | 1) => {
    const node = scrollRef.current
    if (!node) return
    const amount = Math.max(200, Math.round(node.clientWidth * 0.8))
    node.scrollBy({ left: direction * amount, behavior: 'smooth' })
  }

  return (
    <section className={`oweg-section-tight ${view === 'all' ? styles.allDeals : ''}`} aria-label={title}>
      <div className="oweg-container">
        <div className={styles.showcase}>
          <div className={styles.promotion}>
            <div className={styles.headline}><Zap size={30} aria-hidden /><Heading>{title}</Heading></div>
            <p>Grab the best deals before time runs out!</p>
            <div className={styles.countdown} role="timer" aria-label={`${units.map(({value, label}) => `${value} ${label.toLowerCase()}`).join(', ')} remaining`}>
              {units.map(({value, label}) => (
                <div key={label}><strong>{String(value).padStart(2, '0')}</strong><span>{label}</span></div>
              ))}
            </div>
            {view === 'carousel' ? <Link className={styles.browse} href="/flash-sale" prefetch={false}>View all deals <ArrowRight size={17} aria-hidden /></Link> : <Link className={styles.browse} href="/">Back to shopping</Link>}
            {view === 'carousel' && <div className={styles.arrows}>
              <button type="button" onClick={() => scrollByPage(-1)} aria-label="Scroll flash sale left"><ChevronLeft size={18} /></button>
              <button type="button" onClick={() => scrollByPage(1)} aria-label="Scroll flash sale right"><ChevronRight size={18} /></button>
            </div>}
          </div>
          <div ref={scrollRef} className={view === 'all' ? styles.grid : styles.track} role="region" aria-label={view === 'all' ? 'All flash sale products' : 'Flash Sale product carousel'} tabIndex={view === 'all' ? undefined : 0}>
            {data.products.map(product => (
              <FlashSaleProductCard key={product.id} product={product} showImageFallback={showImageFallback} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// Flash Sale Product Card Component (matching ProductCard design)
function FlashSaleProductCard({ product, showImageFallback }: { product: FlashSaleProduct; showImageFallback?: boolean }) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const { customer } = useAuth()
  const { addToWishlist, isLoading: isAddingToWishlist } = useAddToWishlistWithNotification(product.id)

  // Get variant_id from product
  const variantId = product.display_pricing?.variant_id || product.variant_id || product.variants?.[0]?.id || null

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

  const getProductImage = () => {
    if (product.thumbnail) return product.thumbnail
    if (product.images && product.images.length > 0) {
      return product.images[0].url
    }
    return '/placeholder-product.png'
  }

  const price = toNumber(product.display_pricing?.price ?? product.flash_sale_price ?? product.metadata?.price)
  const mrp = toNumber(product.display_pricing?.mrp ?? product.original_price ?? product.metadata?.mrp)
  const discount = mrp > price && price > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0
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
    <article className={styles.card}>
      <div className={styles.media}>
        <Link href={productHref} prefetch={false} className={styles.imageLink} aria-label={product.title}>
          {showImageFallback && failedImage === imageUrl ? (
            <div className={styles.fallback} role="img" aria-label={`${product.title}: image unavailable`}><ImageOff size={26} /><span>Image unavailable</span></div>
          ) : <Image src={imageUrl} alt={product.title} fill className={styles.image} sizes="(max-width: 639px) 160px, 190px" onError={showImageFallback ? () => setFailedImage(imageUrl) : undefined} />}
        </Link>
        <span className={styles.deal}>Deal</span>
        <button type="button" onClick={handleWishlist} disabled={isAddingToWishlist} className={styles.wishlist} aria-label={`Add ${product.title} to wishlist`} aria-pressed={isWishlisted}>
          <Heart size={18} fill={isWishlisted ? 'currentColor' : 'none'} aria-hidden />
        </button>
      </div>
      <div className={styles.body}>
        <Link href={productHref} prefetch={false} className={styles.title}>{product.title}</Link>
        <div className={styles.pricing}>
          <span className={styles.price}>{product.display_pricing?.from && <span className={styles.from}>From </span>}{inr.format(price)}</span>
          {mrp > price && <del>{inr.format(mrp)}</del>}
          {discount > 0 && <span className={styles.discount}>{discount}% OFF</span>}
        </div>
        <ProductCardQuickActions variantId={variantId ?? undefined} selectionHref={product.variants?.length === 1 ? undefined : productHref} productName={product.title} isHovered={false} layout="inline" />
      </div>
    </article>
  )
}

export default FlashSaleSection
