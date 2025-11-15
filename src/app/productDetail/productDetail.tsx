'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronRight, Heart, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { DetailedProduct as DetailedProductType, MedusaCategory } from '@/lib/medusa'
import Breadcrumbs from './components/Breadcrumbs'
import CompareTable from './components/CompareTable'
import DeliveryInfo from './components/DeliveryInfo'
import DescriptionTabs from './components/DescriptionTabs'
import ProductGallery from './components/ProductGallery'
import ProductSummary from './components/ProductSummary'
import type {
  BreadcrumbItem,
  CompareFilters,
  ComparisonColumn,
  DescriptionTab,
  PinStatus,
  ProductDetailProps,
  RelatedProduct,
} from './types'
import {
  deriveColorName,
  extractMetaNumber,
  extractMetaString,
  formatDimensionsDisplay,
  formatWeightDisplay,
  type MetaRecord,
} from './utils/metadata'
import {
  notifyCartAddError,
  notifyCartAddSuccess,
  notifyCartUnavailable,
  notifyCheckoutComingSoon,
  notifyOutOfStock,
  notifyWishlistLogin,
  notifyWishlistSuccess,
} from '@/lib/notifications'
import { useCartSummary } from '@/contexts/CartProvider'

type CategoryNode = Pick<MedusaCategory, 'id' | 'title' | 'name' | 'handle'> & {
  category_children?: CategoryNode[]
}

type CategoryMapEntry = {
  title: string
  handle?: string
  parentId?: string | null
}

const FALLBACK_IMAGE = '/oweg_logo.png'
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

function deriveBrandName(name?: string) {
  if (!name) return 'Other'
  const firstToken = name.trim().split(/\s+/)[0]
  return firstToken ? firstToken.replace(/[^a-z0-9]/gi, '') || 'Other' : 'Other'
}

function enrichRelatedProduct(item: RelatedProduct): RelatedProduct {
  return {
    ...item,
    brand: item.brand || deriveBrandName(item.name),
    color: item.color || deriveColorName(item.name),
    highlights: item.highlights || [],
  }
}


function buildSummaryFromDetail(detail?: DetailedProductType | null, item?: RelatedProduct): string {
  const meta = detail?.metadata as MetaRecord
  return (
    extractMetaString(meta, 'summary') ||
    extractMetaString(meta, 'features') ||
    (detail?.highlights?.length ? detail.highlights.join(', ') : undefined) ||
    detail?.subtitle ||
    (detail?.description ? detail.description.split(/\n+/).find((segment) => segment.trim().length)?.trim() : undefined) ||
    (item?.highlights?.length ? item.highlights.join(', ') : undefined) ||
    '-'
  )
}


export default function ProductDetailPage({ productId }: ProductDetailProps) {
  const router = useRouter()
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
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  const [compareFilters, setCompareFilters] = useState<CompareFilters>({ brand: 'All', color: 'All' })
  const [compareSelection, setCompareSelection] = useState<RelatedProduct[]>([])
  const [compareDetails, setCompareDetails] = useState<Record<string, DetailedProductType | null>>({})
  const [compareDetailsLoading, setCompareDetailsLoading] = useState<Record<string, boolean>>({})
  const [categoryMap, setCategoryMap] = useState<Record<string, CategoryMapEntry>>({})
  const { syncFromCartPayload } = useCartSummary()
  const outOfStockToastRef = useRef<string | null>(null)

  const goToCart = useCallback(() => {
    router.push('/cart')
  }, [router])
  const currentProductId = product?.id
  const categoryIds = useMemo(
    () => Array.from(new Set((product?.categories || []).map((cat) => cat.id).filter((id): id is string => !!id))),
    [product?.categories]
  )
  const primaryAwareCategoryIds = useMemo(() => {
    const ids = new Set<string>(categoryIds)
    if (product?.primaryCategoryId) {
      ids.add(product.primaryCategoryId)
    }
    return Array.from(ids)
  }, [categoryIds, product?.primaryCategoryId])
  const categoryHandles = useMemo(
    () => Array.from(new Set((product?.categories || []).map((cat) => cat.handle).filter((handle): handle is string => !!handle))),
    [product?.categories]
  )

  useEffect(() => {
    let ignore = false
    async function loadCategories() {
      try {
        const res = await fetch('/api/medusa/categories', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const entries: Record<string, CategoryMapEntry> = {}
        const walk = (cat: CategoryNode, parentId: string | null) => {
          if (!cat || !cat.id) return
          entries[cat.id] = {
            title: (cat.title || cat.name || 'Category').toString(),
            handle: cat.handle || undefined,
            parentId,
          }
          const children = cat.category_children || []
          children.forEach((child) => walk(child, cat.id!))
        }
        const rootCats = (data.categories || []) as CategoryNode[]
        rootCats.forEach((cat) => walk(cat, null))
        if (!ignore) {
          setCategoryMap(entries)
        }
      } catch {
        // ignore
      }
    }
    loadCategories()
    return () => {
      ignore = true
    }
  }, [])

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
    const typeQuery = product?.type || undefined
    const categoryLabel = product?.categories?.[0]?.title
    const tagValues = product?.tags || []
    const hasCategoryContext = primaryAwareCategoryIds.length || categoryHandles.length

    if (!hasCategoryContext && !typeQuery && !categoryLabel && !tagValues.length) {
      setRelated([])
      return
    }

    let cancelled = false
    const fetchCandidates = async (path: string) => {
      try {
        const res = await fetch(path, { cache: 'no-store' })
        if (!res.ok) return []
        const data = await res.json()
        const list: RelatedProduct[] = (data.products || [])
          .filter((p: RelatedProduct) => p.id !== currentProductId)
          .map((p: RelatedProduct) => enrichRelatedProduct(p))
        return list
      } catch {
        return []
      }
    }

    async function loadRelated() {
      setLoadingRelated(true)
      try {
        const categoryPaths: string[] = [
          ...primaryAwareCategoryIds.map((id) => `/api/medusa/products?categoryId=${encodeURIComponent(id)}&limit=24`),
          ...categoryHandles.map((handle) => `/api/medusa/products?category=${encodeURIComponent(handle)}&limit=24`),
        ]
        const fallbackPaths: string[] = []
        if (typeQuery) {
          fallbackPaths.push(`/api/medusa/products?type=${encodeURIComponent(typeQuery)}&limit=24`)
        }
        if (categoryLabel) {
          fallbackPaths.push(`/api/medusa/products?category=${encodeURIComponent(categoryLabel)}&limit=24`)
        }
        tagValues.forEach((tag) => {
          fallbackPaths.push(`/api/medusa/products?tag=${encodeURIComponent(tag)}&limit=24`)
        })

        const seen = new Map<string | number, RelatedProduct>()
        const runPaths = async (paths: string[]) => {
          for (const path of paths) {
            const batch = await fetchCandidates(path)
            batch.forEach((item) => {
              if (!seen.has(item.id)) {
                seen.set(item.id, item)
              }
            })
            if (seen.size >= 24) break
          }
        }

        if (categoryPaths.length) {
          await runPaths(categoryPaths)
        }
        if (seen.size === 0 && fallbackPaths.length) {
          await runPaths(fallbackPaths)
        }

        if (!cancelled) {
          const result = Array.from(seen.values())
          const categorySet = new Set(primaryAwareCategoryIds)
          const filtered =
            categorySet.size > 0
              ? result.filter((item) => item.category_ids?.some((id) => categorySet.has(id)))
              : result
          setRelated(filtered.length ? filtered : result)
        }
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
  }, [primaryAwareCategoryIds, categoryHandles, product?.type, product?.categories, product?.tags, currentProductId])

  useEffect(() => {
    setActiveTab('description')
    setPinStatus('idle')
    setPinMessage('')
    setPinCode('')
    setCompareSelection([])
  }, [productId])

  const metadata = product?.metadata as MetaRecord

  const getMetaValue = useCallback(
    (key: string) => {
      if (!metadata) return undefined
      return metadata[key]
    },
    [metadata]
  )

  const getMetaString = useCallback(
    (key: string) => {
      const value = getMetaValue(key)
      return typeof value === 'string' ? value : undefined
    },
    [getMetaValue]
  )

  const getMetaNumber = useCallback(
    (key: string) => {
      const value = getMetaValue(key)
      if (typeof value === 'number') return value
      if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : undefined
      }
      return undefined
    },
    [getMetaValue]
  )

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
  }, [product, getMetaString])

  const ratingValue = useMemo(() => {
    const metaRating = getMetaNumber('rating')
    if (metaRating && Number.isFinite(metaRating)) {
      return Math.min(5, Math.max(0, Number(metaRating)))
    }
    return 4.8
  }, [getMetaNumber])

  const reviewCount = useMemo(() => {
    const value = getMetaNumber('reviews')
    return Number.isFinite(value) && value ? value : 120
  }, [getMetaNumber])

  const viewCount = useMemo(() => {
    const value = getMetaNumber('views')
    return Number.isFinite(value) && value ? value : 7000
  }, [getMetaNumber])

  const compareOptions = useMemo(() => related, [related])
  const availableBrands = useMemo(() => {
    const set = new Set<string>()
    compareOptions.forEach((item) => {
      if (item.brand) set.add(item.brand)
    })
    return ['All', ...Array.from(set).sort()]
  }, [compareOptions])
  const availableColors = useMemo(() => {
    const set = new Set<string>()
    compareOptions.forEach((item) => {
      if (item.color && item.color !== 'All') set.add(item.color)
    })
    return ['All', ...Array.from(set).sort()]
  }, [compareOptions])
  const filteredCompareOptions = useMemo(() => {
    return compareOptions.filter((item) => {
      const brandMatch = compareFilters.brand === 'All' || item.brand === compareFilters.brand
      const colorMatch = compareFilters.color === 'All' || item.color === compareFilters.color
      return brandMatch && colorMatch
    })
  }, [compareOptions, compareFilters])

  useEffect(() => {
    setCompareFilters((prev) => {
      const brandValid = availableBrands.includes(prev.brand) ? prev.brand : 'All'
      const colorValid = availableColors.includes(prev.color) ? prev.color : 'All'
      if (brandValid === prev.brand && colorValid === prev.color) return prev
      return { brand: brandValid, color: colorValid }
    })
  }, [availableBrands, availableColors])

  const isSelectedForCompare = (id: string | number) =>
    compareSelection.some((item) => item.id === id)

  const ensureCompareDetail = useCallback(
    (item: RelatedProduct) => {
      const key = String(item.id)
      if (compareDetails[key] !== undefined || compareDetailsLoading[key]) return
      setCompareDetailsLoading((prev) => ({ ...prev, [key]: true }))
      ;(async () => {
        try {
          const res = await fetch(`/api/medusa/products/${encodeURIComponent(String(item.id))}`, {
            cache: 'no-store',
          })
          if (res.ok) {
            const data = await res.json()
            setCompareDetails((prev) => ({ ...prev, [key]: (data.product as DetailedProductType) || null }))
          } else {
            setCompareDetails((prev) => ({ ...prev, [key]: null }))
          }
        } catch {
          setCompareDetails((prev) => ({ ...prev, [key]: null }))
        } finally {
          setCompareDetailsLoading((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
          })
        }
      })()
    },
    [compareDetails, compareDetailsLoading]
  )

  const toggleCompareSelection = (item: RelatedProduct) => {
    setCompareSelection((prev) => {
      if (prev.some((selected) => selected.id === item.id)) {
        return prev.filter((selected) => selected.id !== item.id)
      }
      ensureCompareDetail(item)
      return [...prev, item]
    })
  }

  const removeFromCompareSelection = (id: string | number) => {
    setCompareSelection((prev) => prev.filter((item) => item.id !== id))
  }

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')

  const mappedCategoryTrail = useMemo(() => {
    if (!product?.primaryCategoryId || !Object.keys(categoryMap).length) return []
    const path: Array<{ label: string; href?: string }> = []
    const visited = new Set<string>()
    let cursor: string | null | undefined = product.primaryCategoryId
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor)
      const node: CategoryMapEntry | undefined = categoryMap[cursor]
      if (!node) break
      path.push({
        label: node.title,
        href: node.handle ? `/category/${node.handle}` : undefined,
      })
      cursor = node.parentId || null
    }
    return path.reverse()
  }, [product?.primaryCategoryId, categoryMap])

  const breadcrumbItems: BreadcrumbItem[] = useMemo(() => {
    const items: Array<{ label: string; href?: string }> = [{ label: 'Home', href: '/' }]
    const categoryTrail: Array<{ id?: string; label: string; href?: string }> = []
    const placeholders = new Set(['category', 'categories', 'uncategorized', 'default'])
    const seenKeys = new Set<string>()

    product?.categories?.forEach((cat) => {
      const raw = (cat.title || cat.handle || '').replace(/[-_]+/g, ' ').trim()
      if (!raw) return
      const norm = raw.toLowerCase()
      if (placeholders.has(norm)) return
      const key = cat.id || norm
      if (seenKeys.has(key)) return
      seenKeys.add(key)
      const fallbackHref = slugify(raw)
      categoryTrail.push({
        id: cat.id,
        label: raw,
        href: cat.handle ? `/category/${cat.handle}` : fallbackHref ? `/category/${fallbackHref}` : undefined,
      })
    })

    if (!categoryTrail.length && product?.type) {
      categoryTrail.push({ label: product.type })
    }

    const fallbackTrail = categoryTrail.map(({ label, href }) => ({ label, href }))
    const finalTrail = mappedCategoryTrail.length ? mappedCategoryTrail : fallbackTrail

    items.push(...finalTrail)

    if (product?.title) {
      items.push({ label: product.title })
    }
    return items
  }, [product, mappedCategoryTrail])

  const breadcrumbPillClass =
    'inline-flex items-center rounded-full border border-green-100 bg-[#eaf6e6] px-3 py-1 text-sm font-medium text-green-700 transition-colors hover:bg-green-100'

  const baseComparisonCard = useMemo<RelatedProduct | null>(() => {
    if (!product) return null
    return {
      id: product.id,
      name: product.title,
      image: product.images?.[0] || product.thumbnail || FALLBACK_IMAGE,
      price: product.price,
      mrp: product.mrp,
      discount: product.discount,
      handle: product.handle,
      variant_id: product.variant_id,
      brand: brandName,
      color: deriveColorName(product.title),
      highlights: product.highlights?.slice(0, 4) || [],
    }
  }, [product, brandName])

  const comparisonProducts = useMemo(() => {
    if (!baseComparisonCard) return []
    const unique = new Map<string | number, RelatedProduct>()
    compareSelection.forEach((item) => unique.set(item.id, item))
    const selections = Array.from(unique.values()).map((item) => ({
      ...item,
      highlights: item.highlights && item.highlights.length ? item.highlights : ['Popular pick', `${item.discount}% off`],
    }))
    return [baseComparisonCard, ...selections]
  }, [baseComparisonCard, compareSelection])

  const comparisonColumns = useMemo<ComparisonColumn[]>(() => {
    return comparisonProducts.map((item, idx) => {
      const key = String(item.id)
      const isBase = idx === 0
      const detail = isBase ? product : compareDetails[key]
      const meta = (detail?.metadata as MetaRecord) || null
      const loading = !isBase && Boolean(compareDetailsLoading[key]) && !detail
      const brand =
        extractMetaString(meta, 'brand') ||
        detail?.collection?.title ||
        item.brand ||
        'OWEG Assured'
      const model =
        extractMetaString(meta, 'model') ||
        extractMetaString(meta, 'model_no') ||
        extractMetaString(meta, 'model_number') ||
        detail?.handle ||
        item.handle ||
        '-'
      const inventory = detail?.variants?.[0]?.inventory_quantity
      let availabilityLabel = '-'
      let availabilityState: 'in' | 'out' | 'unknown' = 'unknown'
      if (typeof inventory === 'number') {
        if (inventory > 0) {
          availabilityLabel = 'In stock'
          availabilityState = 'in'
        } else {
          availabilityLabel = 'Out of stock'
          availabilityState = 'out'
        }
      }
      const rating =
        extractMetaNumber(meta, 'rating') ??
        (isBase ? ratingValue : 4.5)
      const summary = buildSummaryFromDetail(detail || null, item)
      const weight = formatWeightDisplay(detail)
      const dimensions = formatDimensionsDisplay(detail)
      const variantId = detail?.variants?.[0]?.id || item.variant_id
      const slug = encodeURIComponent(String(item.handle || item.id))
      const productHref = `/productDetail/${slug}?id=${encodeURIComponent(String(item.id))}`
      return {
        key,
        item,
        idx,
        isBase,
        detail,
        loading,
        brand,
        model,
        availabilityLabel,
        availabilityState,
        rating,
        summary,
        weight,
        dimensions,
        variantId,
        productHref,
      }
    })
  }, [comparisonProducts, product, compareDetails, compareDetailsLoading, ratingValue])


  const handleCompareNow = () => {
    if (!compareSelection.length) return
    setCompareModalOpen(false)
    setActiveTab('compare')
  }

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

  const hasStock = useMemo(() => {
    if (!product?.variants?.length) return true
    return product.variants.some((variant) => {
      if (typeof variant.inventory_quantity === 'number') {
        return variant.inventory_quantity > 0
      }
      return true
    })
  }, [product?.variants])

  useEffect(() => {
    if (!product?.id) return
    if (!hasStock) {
      if (outOfStockToastRef.current !== product.id) {
        notifyOutOfStock()
        outOfStockToastRef.current = product.id
      }
    } else {
      outOfStockToastRef.current = null
    }
  }, [product?.id, hasStock])

  const handleQuantityChange = (delta: number) => {
    setQuantity((prev) => Math.max(1, prev + delta))
  }

  const addVariantToCart = async (variantId?: string, qty = 1) => {
    if (!variantId) {
      notifyCartUnavailable()
      return
    }
    try {
      await fetch('/api/medusa/cart', { method: 'POST', credentials: 'include' })
      const res = await fetch('/api/medusa/cart/line-items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variant_id: variantId, quantity: qty }),
        credentials: 'include',
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        const message =
          (payload && (payload.error || payload.message)) || 'Unable to add to cart right now.'
        throw new Error(message)
      }
      if (payload) {
        syncFromCartPayload(payload)
      }
      notifyCartAddSuccess(product?.title ?? 'Item', qty, goToCart)
    } catch (err) {
      console.warn('addVariantToCart failed', err)
      const message = err instanceof Error ? err.message : undefined
      notifyCartAddError(message)
    }
  }

  const handleAddToCart = async () => {
    await addVariantToCart(product?.variant_id, quantity)
  }

  const handleBuyNow = () => {
    notifyCheckoutComingSoon()
  }

  const handleAddToWishlist = () => {
    notifyWishlistLogin(() => router.push('/login'))
  }

  const handleSaveForLater = () => {
    notifyWishlistSuccess(product?.title ?? 'Item')
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
      toast.success('Product link copied!', {
        description: 'Share it with your friends.',
      })
    }
  }

  const handlePinInputChange = (value: string) => {
    setPinCode(value)
    setPinStatus('idle')
    setPinMessage('')
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
    <div className="flex min-h-screen flex-col bg-[#f3f8f3] font-sans overflow-x-hidden">
      <style>{`
        :root {
          --detail-accent: #7bc24f;
          --detail-accent-soft: rgba(123, 194, 79, 0.12);
          --detail-border: #dfe9df;
        }
      `}</style>
      <main className="w-full max-w-7xl mx-auto px-4 py-8 lg:py-12 flex-1">
        <Breadcrumbs items={breadcrumbItems} pillClassName={breadcrumbPillClass} />

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
              <ProductGallery
                images={galleryImages}
                selectedIndex={selectedImage}
                onSelect={setSelectedImage}
                fallback={FALLBACK_IMAGE}
              />
              <div className="space-y-5 lg:pl-4">
                <ProductSummary
                  product={product}
                  brandName={brandName}
                  ratingValue={ratingValue}
                  reviewCount={reviewCount}
                  viewCount={viewCount}
                  hasStock={hasStock}
                  quantity={quantity}
                  onQuantityChange={handleQuantityChange}
                  onAddToCart={handleAddToCart}
                  onBuyNow={handleBuyNow}
                  onShare={shareProduct}
                  onSaveForLater={handleSaveForLater}
                  onOpenCompare={() => setCompareModalOpen(true)}
                  formatPrice={(value) => inr.format(value)}
                />
                <DeliveryInfo
                  pinCode={pinCode}
                  pinStatus={pinStatus}
                  pinMessage={pinMessage}
                  onPinCodeChange={handlePinInputChange}
                  onCheck={handlePinCheck}
                />
              </div>
            </section>

            <section className="mt-10">
              <DescriptionTabs
                activeTab={activeTab}
                onTabChange={setActiveTab}
                product={product}
                descriptionHasHtml={descriptionHasHtml}
                highlights={highlights}
                detailPairs={detailPairs}
              />
              {activeTab === 'compare' && (
                <div className="mt-8 space-y-4 lg:pl-4">
                  {comparisonProducts.length <= 1 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-600">
                      <p className="mb-3">
                        Select a few similar products to compare specs side-by-side.
                      </p>
                      <button
                        type="button"
                        onClick={() => setCompareModalOpen(true)}
                        className="rounded-full bg-green-600 px-5 py-2 text-white font-semibold hover:bg-green-700"
                      >
                        Choose products to compare
                      </button>
                    </div>
                  ) : (
                    <>
                      <CompareTable
                        columns={comparisonColumns}
                        formatPrice={(value) => inr.format(value)}
                        onRemove={removeFromCompareSelection}
                        onAddToCart={addVariantToCart}
                        onWishlist={handleAddToWishlist}
                      />
                      {comparisonProducts.length > 1 && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm">
                          <p className="font-semibold text-green-700 mb-1">Suggested pick</p>
                          <p className="mb-2 text-xs text-slate-500">
                            Based on comparative factors, this product offers the best balance:
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const recommended = comparisonProducts.slice(1).sort((a, b) => {
                                const discountDiff = (b.discount || 0) - (a.discount || 0)
                                if (discountDiff !== 0) return discountDiff
                                const wattA = a.summary?.wattage ? parseFloat(a.summary.wattage) : Infinity
                                const wattB = b.summary?.wattage ? parseFloat(b.summary.wattage) : Infinity
                                return wattA - wattB
                              })[0]
                              if (recommended) {
                                const slug = encodeURIComponent(String(recommended.handle || recommended.id))
                                const href = `/productDetail/${slug}?id=${encodeURIComponent(String(recommended.id))}`
                                window.location.href = href
                              }
                            }}
                            className="flex items-center justify-between w-full rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-left hover:bg-green-100 transition"
                          >
                            <div>
                              <p className="text-sm font-semibold">
                                {
                                  comparisonProducts.slice(1).sort((a, b) => (b.discount || 0) - (a.discount || 0))[0]?.name ||
                                  comparisonProducts[1].name
                                }
                              </p>
                              <p className="text-xs text-slate-500">
                                Tap to open detail page with full specs.
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-green-600" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="mt-12">
              <div className="space-y-5 lg:pl-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h1 className="text-xl font-bold text-slate-900">Similar items you might also like</h1>
                    <p className="text-sm text-slate-500">Hand-picked recommendations based on this product.</p>
                  </div>
                  {loadingRelated && <span className="text-sm text-slate-500">Loading suggestions...</span>}
                </div>
                {related.length === 0 && !loadingRelated ? (
                  <div className="text-sm text-slate-500 border border-dashed border-[var(--detail-border)] rounded-2xl px-4 py-3 bg-white/60">
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
                          className="group relative flex flex-col gap-3 p-2 text-left"
                        >
                          {item.discount > 0 && (
                            <span className="absolute top-2 left-2 z-10 text-[11px] font-semibold text-white bg-red-600 px-2 py-1 rounded-full shadow">
                              {item.discount}% off
                            </span>
                          )}
                          <div className="relative aspect-square overflow-hidden rounded-2xl bg-white shadow-sm">
                            <Image
                              src={item.image || FALLBACK_IMAGE}
                              alt={item.name}
                              fill
                              className="object-contain p-4 transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="absolute inset-y-3 right-3 flex flex-col gap-2 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  notifyCartAddError('Please open the product detail page to add this item to your cart.')
                                }}
                                className="w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center shadow hover:bg-green-600"
                                aria-label="Add to cart"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  notifyWishlistLogin(() => router.push('/login'))
                                }}
                                className="w-9 h-9 rounded-full bg-white text-slate-600 flex items-center justify-center shadow border border-slate-200 hover:text-red-500"
                                aria-label="Add to wishlist"
                              >
                                <Heart className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm font-medium text-slate-800 line-clamp-2">{item.name}</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-lg font-semibold text-slate-900">{inr.format(item.price)}</span>
                            <span className="text-xs text-slate-400 line-through">{inr.format(item.mrp)}</span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}
      </main>
      {compareModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-3 py-6">
          <div className="w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Compare similar products</h3>
                <p className="text-sm text-slate-500">
                  Select items from the same category to see a quick spec comparison.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompareModalOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-600">
                Brand
                <select
                  value={compareFilters.brand}
                  onChange={(e) => setCompareFilters((prev) => ({ ...prev, brand: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                >
                  {availableBrands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand === 'All' ? 'All brands' : brand}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-600">
                Color
                <select
                  value={compareFilters.color}
                  onChange={(e) => setCompareFilters((prev) => ({ ...prev, color: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                >
                  {availableColors.map((color) => (
                    <option key={color} value={color}>
                      {color === 'All' ? 'All colors' : color}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 max-h-72 overflow-y-auto pr-1">
              {filteredCompareOptions.length === 0 ? (
                <p className="text-sm text-slate-500">No products match the selected filters.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredCompareOptions.map((item) => {
                    const selected = isSelectedForCompare(item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleCompareSelection(item)}
                        className={`flex items-start gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                          selected ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          readOnly
                          className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500 mt-1"
                        />
                        <div className="relative h-12 w-12 flex-shrink-0 rounded-lg bg-slate-50 overflow-hidden">
                          <Image
                            src={item.image || FALLBACK_IMAGE}
                            alt={item.name}
                            fill
                            className="object-contain p-1.5"
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-900 line-clamp-2">{item.name}</p>
                          <p className="text-xs text-slate-500">
                            {item.brand || 'Other'} Â· {item.color || 'All'}
                          </p>
                          <p className="text-sm font-medium text-slate-800 mt-1">{inr.format(item.price)}</p>
                          <div className="text-xs text-slate-500 mt-1 space-y-1">
                          {item.summary?.wattage && <p>Wattage: {item.summary.wattage}</p>}
                          {item.summary?.size && <p>Sweep: {item.summary.size}</p>}
                          {item.summary?.bestFor && <p>Best for: {item.summary.bestFor}</p>}
                          {item.summary?.noiseLevel && <p>Noise: {item.summary.noiseLevel}</p>}
                          {item.summary?.warranty && <p>Warranty: {item.summary.warranty}</p>}
                        </div>
                      </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setCompareSelection([])}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Clear selection
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  {compareSelection.length} product{compareSelection.length === 1 ? '' : 's'} selected
                </span>
                <button
                  type="button"
                  disabled={!compareSelection.length}
                  onClick={handleCompareNow}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                    compareSelection.length
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  Compare now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div> 
  )
}
