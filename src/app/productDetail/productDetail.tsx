'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Minus,
  Plus,
  RotateCcw,
  Share2,
  ShoppingCart,
  Star,
  Truck,
  Wallet,
} from 'lucide-react'
import type { DetailedProduct as DetailedProductType } from '@/lib/medusa'

type ProductDetailProps = {
  productId: string
}

type RelatedProduct = {
  id: string | number
  name: string
  image: string
  price: number
  mrp: number
  discount: number
  handle?: string
  variant_id?: string
}

const FALLBACK_IMAGE = '/oweg_logo.png'
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
const DESCRIPTION_TABS = [
  { id: 'description', label: 'Description' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'compare', label: 'Compare' },
] as const
type DescriptionTab = (typeof DESCRIPTION_TABS)[number]['id']
type PinStatus = 'idle' | 'checking' | 'available' | 'unavailable'

export default function ProductDetailPage({ productId }: ProductDetailProps) {
  const [product, setProduct] = useState<DetailedProductType | null>(null)
  const [related, setRelated] = useState<RelatedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [loadingRelated, setLoadingRelated] = useState(false)
  const [activeTab, setActiveTab] = useState<DescriptionTab>('description')
  const [pinCode, setPinCode] = useState('')
  const [pinStatus, setPinStatus] = useState<PinStatus>('idle')
  const [pinMessage, setPinMessage] = useState('')
  const categoryId = product?.primaryCategoryId
  const currentProductId = product?.id

  useEffect(() => {
    let cancelled = false
    async function loadProduct() {
      if (!productId) return
      setLoading(true)
      setError(null)
      setSelectedImage(0)
      setQuantity(1)
      try {
        const res = await fetch(`/api/medusa/products/${encodeURIComponent(productId)}`, {
          cache: 'no-store',
        })
        if (!res.ok) {
          throw new Error(res.status === 404 ? 'Product not found' : 'Unable to load product')
        }
        const data = await res.json()
        if (!cancelled) {
          setProduct(data.product as DetailedProductType)
        }
      } catch (err) {
        if (!cancelled) {
          setProduct(null)
          setError(err instanceof Error ? err.message : 'Unable to load product')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadProduct()
    return () => {
      cancelled = true
    }
  }, [productId])

  useEffect(() => {
    const id = categoryId
    if (!id) {
      setRelated([])
      return
    }
    const safeCategoryId: string = id
    let cancelled = false
    async function loadRelated() {
      setLoadingRelated(true)
      try {
        const res = await fetch(`/api/medusa/products?categoryId=${encodeURIComponent(safeCategoryId)}&limit=10`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json()
        const list: RelatedProduct[] = (data.products || [])
          .filter((p: RelatedProduct) => p.id !== currentProductId)
          .map((p: RelatedProduct) => p)
        if (!cancelled) setRelated(list)
      } catch {
        if (!cancelled) setRelated([])
      } finally {
        if (!cancelled) setLoadingRelated(false)
      }
    }
    loadRelated()
    return () => {
      cancelled = true
    }
  }, [categoryId, currentProductId])

  useEffect(() => {
    setActiveTab('description')
    setPinStatus('idle')
    setPinMessage('')
    setPinCode('')
  }, [productId])

  const getMetaValue = (key: string) => {
    const meta = product?.metadata as Record<string, unknown> | null | undefined
    if (!meta) return undefined
    return meta[key]
  }

  const getMetaString = (key: string) => {
    const value = getMetaValue(key)
    return typeof value === 'string' ? value : undefined
  }

  const getMetaNumber = (key: string) => {
    const value = getMetaValue(key)
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
  }

  const galleryImages = useMemo(() => {
    if (product?.images?.length) {
      return product.images
    }
    return [FALLBACK_IMAGE]
  }, [product])

  const galleryKey = useMemo(() => galleryImages.join('|'), [galleryImages])

  useEffect(() => {
    setSelectedImage(0)
  }, [galleryKey])

  const highlights = useMemo(() => {
    if (product?.highlights?.length) return product.highlights
    if (product?.tags?.length) return product.tags
    if (product?.categories?.length) return product.categories.map((c) => c.title).filter(Boolean)
    return []
  }, [product])

  const brandName = useMemo(() => {
    const fromMeta = getMetaString('brand')
    return (
      fromMeta ||
      product?.collection?.title ||
      product?.categories?.[0]?.title ||
      'OWEG Assured'
    )
  }, [product])

  const ratingValue = useMemo(() => {
    const metaRating = getMetaNumber('rating')
    if (metaRating && Number.isFinite(metaRating)) {
      return Math.min(5, Math.max(0, Number(metaRating)))
    }
    return 4.8
  }, [product])

  const reviewCount = useMemo(() => {
    const value = getMetaNumber('reviews')
    return Number.isFinite(value) && value ? value : 120
  }, [product])

  const viewCount = useMemo(() => {
    const value = getMetaNumber('views')
    return Number.isFinite(value) && value ? value : 7000
  }, [product])

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')

  const breadcrumbItems = useMemo(() => {
    const items: Array<{ label: string; href?: string }> = [{ label: 'Home', href: '/' }]
    const categoryTrail: Array<{ label: string; href?: string }> = []
    const placeholders = new Set(['category', 'categories', 'uncategorized', 'default'])
    const seenLabels = new Set<string>()

    product?.categories?.forEach((cat) => {
      const raw = (cat.title || cat.handle || '').replace(/[-_]+/g, ' ').trim()
      if (!raw) return
      const norm = raw.toLowerCase()
      if (placeholders.has(norm)) return
      if (seenLabels.has(norm)) return
      seenLabels.add(norm)
      const fallbackHref = slugify(raw)
      categoryTrail.push({
        label: raw,
        href: cat.handle ? `/category/${cat.handle}` : fallbackHref ? `/category/${fallbackHref}` : undefined,
      })
    })

    if (!categoryTrail.length && product?.type) {
      categoryTrail.push({ label: product.type })
    }

    items.push(...categoryTrail.slice(0, 2))

    if (product?.title) {
      items.push({ label: product.title })
    }
    return items
  }, [product])

  const breadcrumbPillClass =
    'inline-flex items-center rounded-full border border-green-100 bg-[#eaf6e6] px-3 py-1 text-sm font-medium text-green-700 transition-colors hover:bg-green-100'

  const detailPairs = useMemo(() => {
    if (!product) return []
    const entries: Array<{ label: string; value: string }> = []
    if (product.type) entries.push({ label: 'Type', value: product.type })
    if (product.collection?.title) {
      entries.push({ label: 'Collection', value: product.collection.title })
    }
    if (product.categories?.length) {
      entries.push({
        label: 'Category',
        value: product.categories.map((c) => c.title).filter(Boolean).join(', '),
      })
    }
    if (product.tags?.length) {
      entries.push({ label: 'Tags', value: product.tags.join(', ') })
    }
    return entries
  }, [product])

  const hasStock = true

  const handleQuantityChange = (delta: number) => {
    setQuantity((prev) => Math.max(1, prev + delta))
  }

  const handleAddToCart = async () => {
    if (!product?.variant_id) {
      alert('This product is not purchasable yet')
      return
    }
    try {
      await fetch('/api/medusa/cart', { method: 'POST' })
      const res = await fetch('/api/medusa/cart/line-items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variant_id: product.variant_id, quantity }),
      })
      if (!res.ok) throw new Error('Add to cart failed')
      alert('Added to cart')
    } catch (err) {
      console.error(err)
      alert('Unable to add to cart right now.')
    }
  }

  const handleBuyNow = () => {
    alert('Buy Now will redirect to checkout soon.')
  }

  const shareProduct = async () => {
    if (typeof navigator !== 'undefined' && navigator.share && product) {
      try {
        await navigator.share({
          title: product.title,
          text: product.subtitle || product.description || '',
          url: window.location.href,
        })
        return
      } catch {
        // fallthrough
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href)
      alert('Product link copied!')
    }
  }

  const handlePinCheck = () => {
    if (!pinCode || pinCode.trim().length < 6) {
      setPinMessage('Please enter a valid 6 digit PIN code')
      setPinStatus('unavailable')
      return
    }
    setPinStatus('checking')
    setPinMessage('')
    const deadline = Date.now() + 3 * 24 * 60 * 60 * 1000
    const eta = new Intl.DateTimeFormat('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(deadline))

    setTimeout(() => {
      const available = !pinCode.trim().startsWith('9')
      setPinStatus(available ? 'available' : 'unavailable')
      setPinMessage(
        available
          ? `FREE delivery available. Expected by ${eta}.`
          : 'Delivery is currently unavailable for this PIN code.'
      )
    }, 600)
  }

  const descriptionHasHtml = Boolean(product?.description && /<\/?[a-z][\s\S]*>/i.test(product.description))

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f8f3] font-sans">
      <style>{`
        :root {
          --detail-accent: #7bc24f;
          --detail-accent-soft: rgba(123, 194, 79, 0.12);
          --detail-border: #dfe9df;
        }
      `}</style>
      <main className="w-full max-w-7xl mx-auto px-4 py-8 lg:py-12 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 mb-6">
          {breadcrumbItems.map((item, idx) => (
            <React.Fragment key={`${item.label}-${idx}`}>
              {idx > 0 && <ChevronRight className="w-4 h-4 text-green-500" />}
              {idx === breadcrumbItems.length - 1 ? (
                <span className="text-slate-900 font-semibold">{item.label}</span>
              ) : item.href ? (
                <Link href={item.href} className={breadcrumbPillClass}>
                  {item.label}
                </Link>
              ) : (
                <span className={breadcrumbPillClass}>{item.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {loading ? (
          <div className="animate-pulse space-y-6">
            <div className="h-64 rounded-2xl bg-white/70" />
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="h-96 rounded-2xl bg-white/70" />
              <div className="space-y-4">
                <div className="h-6 bg-white/70 rounded w-1/2" />
                <div className="h-6 bg-white/70 rounded w-1/3" />
                <div className="h-32 bg-white/70 rounded" />
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="bg-white border border-red-100 text-red-600 rounded-2xl p-8 text-center">
            <p className="text-lg font-semibold mb-2">We couldn&apos;t load this product</p>
            <p className="text-sm text-red-500 mb-4">{error}</p>
            <Link href="/" className="text-green-600 font-medium hover:underline">
              Continue shopping
            </Link>
          </div>
        ) : product ? (
          <>
            <section className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] gap-8 lg:gap-10 mb-10">
              <div className="space-y-4">
                <div className="relative aspect-square rounded-[32px] border border-[var(--detail-border)] bg-white shadow-sm overflow-hidden group">
                  <Image
                    src={galleryImages[selectedImage] || FALLBACK_IMAGE}
                    alt={product.title}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-contain p-4 lg:p-10 transition-transform duration-300 group-hover:scale-105"
                    priority
                  />
                  {galleryImages.length > 1 && (
                    <div className="absolute inset-x-0 bottom-4 flex justify-between px-4">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedImage((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1))
                        }
                        className="w-10 h-10 rounded-full bg-white/90 text-slate-700 flex items-center justify-center shadow border border-slate-100"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedImage((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1))
                        }
                        className="w-10 h-10 rounded-full bg-white/90 text-slate-700 flex items-center justify-center shadow border border-slate-100"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
                 <div className="grid grid-cols-4 gap-3">
                  {galleryImages.map((img, idx) => (
                    <button
                      key={img + idx}
                      type="button"
                      onClick={() => setSelectedImage(idx)}
                      onMouseEnter={() => setSelectedImage(idx)}
                      onFocus={() => setSelectedImage(idx)}
                      className={`aspect-square rounded-2xl border ${
                        selectedImage === idx ? 'border-green-500 ring-2 ring-green-100' : 'border-slate-200'
                      } overflow-hidden bg-white`}
                    >
                      <Image
                        src={img}
                        alt={`${product.title}-${idx}`}
                        width={200}
                        height={200}
                        className="object-contain w-full h-full p-2"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-[32px] border border-[var(--detail-border)] p-6 lg:p-8 shadow-sm space-y-5">
                <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-wide text-green-700">
                  <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full">OWEG Exclusive</span>
                  <span className="text-slate-400">|</span>
                  <span>{brandName}</span>
                </div>
                <h1 className="text-2xl lg:text-3xl font-semibold text-slate-900">{product.title}</h1>
                {product.subtitle && <p className="text-slate-500">{product.subtitle}</p>}

                <div className="flex flex-wrap items-end gap-3">
                  <div className="text-3xl font-bold text-slate-900">{inr.format(product.price)}</div>
                  <div className="text-lg text-slate-400 line-through">{inr.format(product.mrp)}</div>
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
                    {hasStock ? 'In stock' : 'Limited availability'}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center border border-slate-200 rounded-full overflow-hidden">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(-1)}
                      className="px-3 py-2 text-slate-600 hover:bg-slate-50"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="px-4 text-base font-semibold text-slate-900">{quantity}</div>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(1)}
                      className="px-3 py-2 text-slate-600 hover:bg-slate-50"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      className="inline-flex items-center gap-2 rounded-full bg-green-600 px-6 py-3 text-white font-semibold shadow hover:bg-green-700 transition"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      Add to cart
                    </button>
                    <button
                      type="button"
                      onClick={handleBuyNow}
                      className="inline-flex items-center gap-2 rounded-full border border-green-600 px-6 py-3 text-green-700 font-semibold hover:bg-green-50 transition"
                    >
                      Buy now
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-green-600 transition"
                  >
                    <Bookmark className="w-4 h-4" />
                    Save for later
                  </button>
                  <button
                    type="button"
                    onClick={shareProduct}
                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-green-600 transition"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                </div>

                <div className="space-y-4 rounded-3xl border border-[var(--detail-border)] bg-[#f8fbf8] p-5">
                  <div className="flex items-start gap-3">
                    <Truck className="w-6 h-6 text-green-600" />
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">Free Delivery</p>
                      <p className="text-sm text-slate-500">Enter your postal code for delivery availability</p>
                      <div className="mt-3 flex flex-col gap-2">
                        <div className="flex gap-2">
                          <input
                            value={pinCode}
                            onChange={(event) => {
                              setPinCode(event.target.value)
                              setPinStatus('idle')
                              setPinMessage('')
                            }}
                            type="text"
                            maxLength={6}
                            placeholder="Enter PIN code"
                            className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                          />
                          <button
                            type="button"
                            onClick={handlePinCheck}
                            className="rounded-full bg-green-600 px-4 py-2 text-white text-sm font-semibold"
                          >
                            Check
                          </button>
                        </div>
                        {pinStatus !== 'idle' && (
                          <p
                            className={`text-sm ${
                              pinStatus === 'available' ? 'text-green-600' : pinStatus === 'checking' ? 'text-slate-500' : 'text-red-500'
                            }`}
                          >
                            {pinStatus === 'checking' ? 'Checking serviceability...' : pinMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 border-t border-dashed border-slate-200 pt-4">
                    <RotateCcw className="w-6 h-6 text-green-600" />
                    <div>
                      <p className="font-semibold text-slate-900">Return Delivery</p>
                      <p className="text-sm text-slate-500">7 days easy return & replacement on defects.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 border-t border-dashed border-slate-200 pt-4">
                    <Wallet className="w-6 h-6 text-green-600" />
                    <div>
                      <p className="font-semibold text-slate-900">Cash on Delivery</p>
                      <p className="text-sm text-slate-500">Pay at your doorstep via cash or card.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-10">
              <div className="bg-white rounded-[32px] border border-[var(--detail-border)] p-6 lg:p-8 shadow-sm">
                <div className="flex gap-6 border-b border-slate-100 mb-6">
                  {DESCRIPTION_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`pb-3 text-sm font-semibold transition-all border-b-2 ${
                        activeTab === tab.id
                          ? 'text-green-700 border-green-600'
                          : 'text-slate-400 border-transparent hover:text-slate-600'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {activeTab === 'description' && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 mb-3">Product Description</h2>
                      {product.description ? (
                        descriptionHasHtml ? (
                          <div
                            className="prose prose-sm max-w-none text-slate-700"
                            dangerouslySetInnerHTML={{ __html: product.description }}
                          />
                        ) : (
                          product.description
                            .split(/\n+/)
                            .filter(Boolean)
                            .map((para, idx) => (
                              <p key={idx} className="text-sm text-slate-600 mb-3 leading-relaxed">
                                {para}
                              </p>
                            ))
                        )
                      ) : (
                        <p className="text-sm text-slate-500">Detailed description will be available soon.</p>
                      )}
                    </div>

                    {highlights.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-3">Benefits</h3>
                        <div className="grid sm:grid-cols-2 gap-3">
                          {highlights.map((highlight) => (
                            <div
                              key={`benefit-${highlight}`}
                              className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-[#f9fcf8] p-3 text-sm text-slate-700"
                            >
                              <Check className="w-4 h-4 text-green-600 mt-1" />
                              <span>{highlight}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {detailPairs.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">Product Details</h3>
                        <div className="space-y-3">
                          {detailPairs.map((pair) => (
                            <div
                              key={pair.label}
                              className="flex flex-col rounded-2xl border border-slate-100 bg-[#f9fcf8] px-4 py-3 text-sm"
                            >
                              <span className="text-xs uppercase tracking-wide text-slate-500">{pair.label}</span>
                              <span className="text-base font-semibold text-slate-800">{pair.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {activeTab === 'reviews' && (
                  <div className="text-sm text-slate-600">
                    Reviews will appear here once shoppers share their experience. Check back soon!
                  </div>
                )}
                {activeTab === 'compare' && (
                  <div className="text-sm text-slate-600">
                    Comparison data is being prepared for this product. We&apos;ll highlight alternatives shortly.
                  </div>
                )}
              </div>
            </section>

            <section className="mt-12 bg-white rounded-[32px] border border-[var(--detail-border)] p-6 lg:p-8 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Similar items you might also like</h2>
                  <p className="text-sm text-slate-500">Hand-picked recommendations based on this product.</p>
                </div>
                {loadingRelated && <span className="text-sm text-slate-500">Loading suggestions...</span>}
              </div>
              {related.length === 0 && !loadingRelated ? (
                <div className="text-sm text-slate-500 bg-[#f8fbf8] rounded-2xl border border-dashed border-[var(--detail-border)] p-6">
                  We&apos;re curating recommendations for this product.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {related.map((item) => {
                    const slug = encodeURIComponent(String(item.handle || item.id))
                    const href = `/productDetail/${slug}?id=${encodeURIComponent(String(item.id))}`
                    return (
                      <Link
                        key={item.id}
                        href={href}
                        className="relative bg-white border border-slate-100 rounded-3xl p-4 hover:shadow-lg transition flex flex-col"
                      >
                        {item.discount > 0 && (
                          <span className="absolute top-3 left-3 text-[11px] font-semibold text-white bg-red-600 px-2 py-1 rounded-full shadow">
                            {item.discount}% off
                          </span>
                        )}
                        <div className="relative aspect-square rounded-2xl bg-slate-50 overflow-hidden mb-3">
                          <Image
                            src={item.image || FALLBACK_IMAGE}
                            alt={item.name}
                            fill
                            className="object-contain p-4"
                          />
                        </div>
                        <p className="text-sm font-medium text-slate-800 line-clamp-2 flex-1">{item.name}</p>
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className="text-lg font-semibold text-slate-900">{inr.format(item.price)}</span>
                          <span className="text-xs text-slate-400 line-through">{inr.format(item.mrp)}</span>
                        </div>
                        <button
                          type="button"
                          className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center shadow"
                          aria-label="Add similar item to cart"
                        >
                          +
                        </button>
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}
