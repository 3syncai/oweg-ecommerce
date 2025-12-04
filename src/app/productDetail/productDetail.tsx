'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronRight, Heart, Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import type { DetailedProduct as DetailedProductType, MedusaCategory } from '@/lib/medusa'
import Breadcrumbs from './components/Breadcrumbs'
import CompareTable from './components/CompareTable'
import DeliveryInfo from './components/DeliveryInfo'
import DescriptionTabs from './components/DescriptionTabs'
import dynamic from 'next/dynamic'
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
  SavingsCategoryOption,
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
import { useAuth } from '@/contexts/AuthProvider'
import { useCartSummary } from '@/contexts/CartProvider'

const ProductSavingsExplorer = dynamic(() => import('./components/ProductSavingsExplorer'), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm animate-pulse h-48" />
  ),
})

type CategoryNode = Pick<MedusaCategory, 'id' | 'title' | 'name' | 'handle'> & {
  category_children?: CategoryNode[]
  parent_category_id?: string | null
  parent_category?: { id?: string | null } | null
}

type CategoryMapEntry = {
  title: string
  handle?: string
  parentId?: string | null
}

const FALLBACK_IMAGE = '/oweg_logo.png'
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const humanizeCategoryLabel = (value: string) =>
  value
    .replace(/^(handle:|label:)/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim()

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

export default function ProductDetailPage({ productId, initialProduct }: ProductDetailProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [quantity, setQuantity] = useState(1)
  const [selectedImage, setSelectedImage] = useState(0)
  const [activeTab, setActiveTab] = useState<DescriptionTab>('description')
  const [pinCode, setPinCode] = useState('')
  const [pinStatus, setPinStatus] = useState<PinStatus>('idle')
  const [pinMessage, setPinMessage] = useState('')
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  const [compareFilters, setCompareFilters] = useState<CompareFilters>({ brand: 'All', color: 'All' })
  const [compareSelection, setCompareSelection] = useState<RelatedProduct[]>([])
  const [compareDetails, setCompareDetails] = useState<Record<string, DetailedProductType | null>>({})
  const [compareDetailsLoading, setCompareDetailsLoading] = useState<Record<string, boolean>>({})
  const { syncFromCartPayload, refresh: refreshCart } = useCartSummary()
  const summaryScrollRef = useRef<HTMLDivElement | null>(null)
  const outOfStockToastRef = useRef<string | null>(null)
  const [wishlistBusy, setWishlistBusy] = useState(false)
  const sourceTagParam = searchParams?.get('sourceTag')?.trim() || undefined
  const sourceCategoryIdParam = searchParams?.get('sourceCategoryId')?.trim() || undefined
  const sourceCategoryHandleParam = searchParams?.get('sourceCategoryHandle')?.trim() || undefined
  const { customer, setCustomer } = useAuth()

  const goToCart = useCallback(() => {
    router.push('/cart')
  }, [router])

  // Capture wheel scrolling to exhaust summary content before page scroll
  useEffect(() => {
    const el = summaryScrollRef.current
    if (!el) return

    const onWheel = (event: WheelEvent) => {
      if (!el) return
      const delta = event.deltaY
      const atTop = el.scrollTop <= 0
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight

      // If there is still room to scroll inside the summary, consume the wheel event
      if ((delta > 0 && !atBottom) || (delta < 0 && !atTop)) {
        event.preventDefault()
        el.scrollBy({ top: delta, behavior: 'auto' })
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
    }
  }, [])
  const {
    data: productResponse,
    isLoading: productLoading,
    error: productQueryError,
  } = useQuery({
    queryKey: ['product-detail', productId],
    enabled: Boolean(productId),
    queryFn: async () => {
      if (!productId) throw new Error('Missing product id')
      const res = await fetch(`/api/medusa/products/${encodeURIComponent(productId)}`, { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(res.status === 404 ? 'Product not found' : 'Unable to load product')
      }
      return (await res.json()) as { product: DetailedProductType }
    },
    initialData: initialProduct ? { product: initialProduct } : undefined,
    placeholderData: initialProduct ? { product: initialProduct } : undefined,
    staleTime: 1000 * 60 * 3,
  })
  const product = productResponse?.product ?? null
  const isWishlisted = useMemo(() => {
    const list = (customer?.metadata as Record<string, unknown> | undefined)?.wishlist
    if (!Array.isArray(list)) return false
    return list.map((id) => id?.toString()).includes(product?.id?.toString() || '')
  }, [customer?.metadata, product?.id])
  const error =
    productQueryError instanceof Error ? productQueryError.message : productQueryError ? 'Unable to load product' : null
  const currentProductId = product?.id
  const categoryIds = useMemo(
    () => Array.from(new Set((product?.categories || []).map((cat) => cat.id).filter((id): id is string => !!id))),
    [product?.categories]
  )
  const allCategoryHandles = useMemo(
    () => Array.from(new Set((product?.categories || []).map((cat) => cat.handle).filter((handle): handle is string => !!handle))),
    [product?.categories]
  )

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')

  type TrailNode = { id?: string; label: string; href?: string }

  const placeholders = useMemo(() => new Set(['category', 'categories', 'uncategorized', 'default']), [])

  const categoriesQuery = useQuery({
    queryKey: ['medusa-categories'],
    queryFn: async () => {
      const res = await fetch('/api/medusa/categories', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error('Unable to load categories')
      }
      return res.json()
    },
  })
  const categoryMap = useMemo(() => {
    const data = categoriesQuery.data
    const raw: CategoryNode[] = Array.isArray(data?.categories)
      ? (data?.categories as CategoryNode[])
      : Array.isArray(data?.product_categories)
        ? (data?.product_categories as CategoryNode[])
        : []
    if (!raw.length) return {}
    const entries: Record<string, CategoryMapEntry> = {}

    function traverse(node: CategoryNode | undefined, parentId: string | null): void {
      if (!node || !node.id) return
      const title = (node.title || node.name || 'Category').toString()
      entries[node.id] = {
        title,
        handle: node.handle || undefined,
        parentId: parentId ?? node.parent_category_id ?? node.parent_category?.id ?? null,
      }
      const children = node.category_children || []
      children.forEach((child: CategoryNode | undefined) => traverse(child, node.id))
    }

    const hasNested = raw.some((r) => Array.isArray(r.category_children) && r.category_children.length > 0)

    if (hasNested) {
      raw.forEach((root: CategoryNode) => traverse(root, root.parent_category_id ?? root.parent_category?.id ?? null))
    } else {
      raw.forEach((cat: CategoryNode) => {
        if (!cat?.id) return
        const title = (cat.title || cat.name || 'Category').toString()
        const parent = cat.parent_category_id ?? cat.parent_category?.id ?? null
        entries[cat.id] = {
          title,
          handle: cat.handle || undefined,
          parentId: parent,
        }
      })
    }

    raw.forEach((node: CategoryNode) => {
      if (!node?.id) return
      const children = node.category_children || []
      children.forEach((child: CategoryNode | undefined) => {
        if (!child?.id) return
        entries[child.id] = entries[child.id] || {
          title: (child.title || child.name || 'Category').toString(),
          handle: child.handle || undefined,
          parentId: node.id,
        }
        entries[child.id].parentId = node.id
      })
    })

    return entries
  }, [categoriesQuery.data])

  const fallbackCategoryTrail = useMemo<TrailNode[]>(() => {
    const seen = new Set<string>()
    const nodes: TrailNode[] = []
    product?.categories?.forEach((cat) => {
      const raw = (cat.title || cat.handle || '').replace(/[-_]+/g, ' ').trim()
      if (!raw) return
      const norm = raw.toLowerCase()
      if (placeholders.has(norm)) return
      const key = cat.id || norm
      if (seen.has(key)) return
      seen.add(key)
      const fallbackHrefSlug = slugify(raw)
      // Use /c/ route consistent with rest of app
      nodes.push({
        id: cat.id,
        label: raw,
        href: cat.handle ? `/c/${cat.handle}` : fallbackHrefSlug ? `/c/${fallbackHrefSlug}` : undefined,
      })
    })
    if (!nodes.length && product?.type) {
      nodes.push({ label: product.type })
    }
    return nodes
  }, [product, placeholders])

  const categoryTrailsFromMap = useMemo<TrailNode[][]>(() => {
    if (!product?.categories?.length || !Object.keys(categoryMap).length) return []
    const buildTrail = (startId: string): TrailNode[] => {
      const list: TrailNode[] = []
      const visited = new Set<string>()
      let cursor: string | null | undefined = startId
      while (cursor && !visited.has(cursor)) {
        visited.add(cursor)
        const node: CategoryMapEntry | undefined = categoryMap[cursor]
        if (!node) break
        list.push({
          id: cursor,
          label: node.title,
          href: node.handle ? `/c/${node.handle}` : undefined,
        })
        cursor = node.parentId || null
      }
      return list.length ? list.reverse() : []
    }
    const trails: TrailNode[][] = []
    product.categories.forEach((cat) => {
      if (!cat.id) return
      const trail = buildTrail(cat.id)
      if (trail.length) trails.push(trail)
    })
    return trails
  }, [product?.categories, categoryMap])

  const deepestCategoryTrails = useMemo(() => {
    if (!categoryTrailsFromMap.length) return []
    let maxDepth = 0
    categoryTrailsFromMap.forEach((trail) => {
      if (trail.length > maxDepth) maxDepth = trail.length
    })
    return categoryTrailsFromMap.filter((trail) => trail.length === maxDepth)
  }, [categoryTrailsFromMap])

  const breadcrumbTrail = useMemo<TrailNode[]>(() => {
    if (deepestCategoryTrails.length) {
      if (product?.primaryCategoryId) {
        const match = deepestCategoryTrails.find((t) => t[t.length - 1]?.id === product.primaryCategoryId)
        if (match) return match
      }
      return deepestCategoryTrails[0]
    }
    return fallbackCategoryTrail
  }, [deepestCategoryTrails, fallbackCategoryTrail, product?.primaryCategoryId])

  const childCategoryIds = useMemo(() => {
    if (!deepestCategoryTrails.length) return []
    const ids = deepestCategoryTrails
      .map((trail) => trail[trail.length - 1]?.id)
      .filter((id): id is string => !!id)
    return Array.from(new Set(ids))
  }, [deepestCategoryTrails])

  const childCategoryHandles = useMemo(
    () =>
      childCategoryIds
        .map((id) => (id ? categoryMap[id]?.handle : undefined))
        .filter((handle): handle is string => !!handle),
    [childCategoryIds, categoryMap]
  )

  const buildOrderedUnique = (
    groups: Array<Array<string | undefined | null>>
  ): string[] => {
    const seen = new Set<string>()
    const ordered: string[] = []
    groups.forEach((group) => {
      group.forEach((value) => {
        if (!value) return
        if (!seen.has(value)) {
          seen.add(value)
          ordered.push(value)
        }
      })
    })
    return ordered
  }

  const categoryHandlesForFetch = useMemo(() => {
    return buildOrderedUnique([
      [sourceCategoryHandleParam],
      childCategoryHandles,
      allCategoryHandles,
    ])
  }, [childCategoryHandles, allCategoryHandles, sourceCategoryHandleParam])

  const primaryAwareCategoryIds = useMemo(() => {
    return buildOrderedUnique([
      [sourceCategoryIdParam],
      childCategoryIds,
      categoryIds,
      [product?.primaryCategoryId],
    ])
  }, [childCategoryIds, categoryIds, product?.primaryCategoryId, sourceCategoryIdParam])

  const breadcrumbItems: BreadcrumbItem[] = useMemo(() => {
    const items: BreadcrumbItem[] = [{ label: 'Home', href: '/' }]
    breadcrumbTrail.forEach((node) => {
      if (!node?.label) return
      items.push({ label: node.label, href: node.href })
    })
    if (product?.title) {
      items.push({ label: product.title })
    }
    return items
  }, [breadcrumbTrail, product?.title])

  const shouldUseSourceTag = useMemo(
    () => Boolean(sourceTagParam && !sourceCategoryIdParam && !sourceCategoryHandleParam),
    [sourceTagParam, sourceCategoryIdParam, sourceCategoryHandleParam]
  )

  const preferredTagValues = useMemo(() => {
    const set = new Set<string>()
    if (shouldUseSourceTag && sourceTagParam) set.add(sourceTagParam)
    ;(product?.tags || []).forEach((tag) => {
      if (tag) set.add(tag)
    })
    return Array.from(set)
  }, [shouldUseSourceTag, sourceTagParam, product?.tags])

  const savedAmount = useMemo(() => {
    if (!product) return 0
    const mrp = typeof product.mrp === 'number' ? product.mrp : 0
    const price = typeof product.price === 'number' ? product.price : 0
    const delta = mrp - price
    return Number.isFinite(delta) && delta > 0 ? delta : 0
  }, [product])

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
  useEffect(() => {
    setQuantity(1)
  }, [productId])

  const highlights = useMemo(() => {
    if (product?.highlights?.length) return product.highlights
    if (preferredTagValues.length) return preferredTagValues
    if (product?.categories?.length) return product.categories.map((c) => c.title).filter(Boolean)
    return []
  }, [product, preferredTagValues])

  const primaryAwareCategoryKey = useMemo(() => primaryAwareCategoryIds.join('|'), [primaryAwareCategoryIds])
  const categoryHandlesKey = useMemo(() => categoryHandlesForFetch.join('|'), [categoryHandlesForFetch])
  const preferredTagKey = useMemo(() => preferredTagValues.join('|'), [preferredTagValues])
  const productCategoriesKey = useMemo(
    () =>
      (product?.categories || [])
        .map((cat) => `${cat?.id || ''}:${cat?.title || ''}:${cat?.handle || ''}`)
        .join('|'),
    [product?.categories]
  )
  const categoryMapSignature = useMemo(
    () =>
      Object.entries(categoryMap)
        .map(([id, entry]) => `${id}:${entry?.title || ''}:${entry?.parentId || ''}:${entry?.handle || ''}`)
        .join('|'),
    [categoryMap]
  )
  const relatedFetchSignature = useMemo(
    () =>
      [
        primaryAwareCategoryKey,
        categoryHandlesKey,
        preferredTagKey,
        product?.type || '',
        productCategoriesKey,
        currentProductId || '',
        categoryMapSignature,
      ].join('||'),
    [
      primaryAwareCategoryKey,
      categoryHandlesKey,
      preferredTagKey,
      product?.type,
      productCategoriesKey,
      currentProductId,
      categoryMapSignature,
    ]
  )
  const relatedQuery = useQuery({
    queryKey: ['related-products', relatedFetchSignature],
    enabled: Boolean(currentProductId),
    queryFn: async () => {
      const typeQuery = product?.type || undefined
      const categoryLabel = product?.categories?.[0]?.title
      const tagValues = preferredTagValues
      const hasCategoryContext = primaryAwareCategoryIds.length || categoryHandlesForFetch.length
      if (!hasCategoryContext && !typeQuery && !categoryLabel && !tagValues.length) {
        return []
      }
      const categoryHandleLookup = new Map<string, string>()
      Object.entries(categoryMap).forEach(([id, entry]) => {
        if (entry?.handle) categoryHandleLookup.set(entry.handle, id)
      })

      const desiredCount = 24
      const fetchCandidates = async (meta: { url: string; hintId?: string; hintLabel?: string }) => {
        try {
          const res = await fetch(meta.url, { cache: 'no-store' })
          if (!res.ok) return []
          const data = await res.json()
          let list: RelatedProduct[] = (data.products || [])
            .filter((p: RelatedProduct) => p.id !== currentProductId)
            .map((p: RelatedProduct) => enrichRelatedProduct(p))
          if (meta.hintId) {
            const hintKey = String(meta.hintId)
            list = list.map((item) => {
              const categories = new Set((item.category_ids || []).map((id) => id && String(id)).filter(Boolean) as string[])
              categories.add(hintKey)
              const labels = { ...(item.category_labels || {}) }
              if (meta.hintLabel) labels[hintKey] = meta.hintLabel
              return {
                ...item,
                category_ids: Array.from(categories),
                category_labels: Object.keys(labels).length ? labels : item.category_labels,
              }
            })
          }
          return list
        } catch {
          return []
        }
      }

      const humanizeHandle = (value: string) =>
        value
          .replace(/[-_]+/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase())
          .trim()

      const buildTagPath = (tag: string) => `/api/medusa/products?tag=${encodeURIComponent(tag)}&limit=${desiredCount}`
      const tagPaths =
        tagValues.length > 0 && !sourceCategoryIdParam && !sourceCategoryHandleParam
          ? tagValues.map((tag) => ({ url: buildTagPath(tag) }))
          : []
      const categoryPaths = [
        ...primaryAwareCategoryIds.map((id) => ({
          url: `/api/medusa/products?categoryId=${encodeURIComponent(id)}&limit=${desiredCount}`,
          hintId: id,
          hintLabel: categoryMap[id]?.title || categoryMap[id]?.handle || 'Category',
        })),
        ...categoryHandlesForFetch.map((handle) => {
          const resolvedId = categoryHandleLookup.get(handle)
          const label =
            (resolvedId && (categoryMap[resolvedId]?.title || categoryMap[resolvedId]?.handle)) || humanizeHandle(handle)
          return {
            url: `/api/medusa/products?category=${encodeURIComponent(handle)}&limit=${desiredCount}`,
            hintId: resolvedId || `handle:${handle}`,
            hintLabel: label,
          }
        }),
      ]
      const fallbackPaths: { url: string; hintId?: string; hintLabel?: string }[] = []
      if (typeQuery) {
        fallbackPaths.push({ url: `/api/medusa/products?type=${encodeURIComponent(typeQuery)}&limit=${desiredCount}` })
      }
      if (categoryLabel) {
        const normalizedLabel = humanizeHandle(categoryLabel)
        fallbackPaths.push({
          url: `/api/medusa/products?category=${encodeURIComponent(categoryLabel)}&limit=${desiredCount}`,
          hintId: `label:${normalizedLabel}`,
          hintLabel: normalizedLabel,
        })
      }

      const seen = new Map<string | number, RelatedProduct>()
      const runPaths = async (
        paths: Array<{ url: string; hintId?: string; hintLabel?: string }>,
        stopAfterFirstNewBatch: boolean
      ) => {
        for (const meta of paths) {
          const before = seen.size
          const batch = await fetchCandidates(meta)
          batch.forEach((item) => {
            if (!seen.has(item.id)) {
              seen.set(item.id, item)
              return
            }
            const existing = seen.get(item.id)!
            const mergedIds = Array.from(
              new Set(
                [...(existing.category_ids || []), ...(item.category_ids || [])]
                  .map((value) => (value == null ? '' : String(value)))
                  .filter((value) => value.trim().length > 0)
              )
            )
            const mergedLabels = { ...(existing.category_labels || {}) }
            Object.entries(item.category_labels || {}).forEach(([key, value]) => {
              if (value && !mergedLabels[key]) {
                mergedLabels[key] = value
              }
            })
            seen.set(item.id, {
              ...existing,
              ...item,
              category_ids: mergedIds.length ? mergedIds : existing.category_ids,
              category_labels: Object.keys(mergedLabels).length > 0 ? mergedLabels : existing.category_labels,
            })
          })
          if (seen.size >= desiredCount) return true
          if (stopAfterFirstNewBatch && seen.size > before) return true
        }
        return false
      }

      let satisfied = false
      if (tagPaths.length) {
        satisfied = await runPaths(tagPaths, true)
      }
      if (categoryPaths.length) {
        const categoryResult = await runPaths(categoryPaths, !satisfied)
        satisfied = satisfied || categoryResult
      }
      if (!satisfied && fallbackPaths.length) {
        await runPaths(fallbackPaths, false)
      }

      const result = Array.from(seen.values())
      const categorySet = new Set(primaryAwareCategoryIds)
      const filtered =
        categorySet.size > 0 ? result.filter((item) => item.category_ids?.some((id) => categorySet.has(id))) : result
      return filtered.length ? filtered : result
    },
  })
  const related = useMemo(() => relatedQuery.data || [], [relatedQuery.data])
  const loadingRelated = relatedQuery.isLoading


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
  const savingsCategoryOptions = useMemo(() => {
    const countMap = new Map<string, number>()
    const minPriceMap = new Map<string, number>()
    const labelHintMap = new Map<string, string>()

    const registerToken = (token?: string, labelHint?: string, price?: number) => {
      if (!token) return
      const normalized = token.trim()
      if (!normalized) return
      countMap.set(normalized, (countMap.get(normalized) || 0) + 1)
      if (Number.isFinite(price) && price && price > 0) {
        const existing = minPriceMap.get(normalized)
        if (existing === undefined || price < existing) {
          minPriceMap.set(normalized, price)
        }
      }
      if (labelHint && !labelHintMap.has(normalized)) {
        labelHintMap.set(normalized, labelHint.trim())
      }
    }

    related.forEach((item) => {
      const price = Number(item.price)
      const labels = item.category_labels || {}
      const tokens = new Set<string>()
      ;(item.category_ids || [])
        .map((id) => (id == null ? '' : String(id)))
        .filter((id) => id.trim().length > 0)
        .forEach((id) => tokens.add(id))
      Object.entries(labels).forEach(([key, value]) => {
        if (!key) return
        tokens.add(String(key))
        if (value) {
          labelHintMap.set(String(key), value)
        }
      })
      tokens.forEach((token) => registerToken(token, labels[token], price))
    })

    const entries = Object.entries(categoryMap)
    const childrenMap = new Map<string, string[]>()
    entries.forEach(([id]) => {
      if (!childrenMap.has(id)) {
        childrenMap.set(id, [])
      }
    })
    entries.forEach(([id, entry]) => {
      const parent = entry?.parentId
      if (!parent) return
      const existing = childrenMap.get(parent) || []
      existing.push(id)
      childrenMap.set(parent, existing)
    })

    const descendantCache = new Map<string, Set<string>>()
    const getDescendants = (id: string): Set<string> => {
      if (descendantCache.has(id)) {
        return descendantCache.get(id)!
      }
      const acc = new Set<string>([id])
      const children = childrenMap.get(id) || []
      children.forEach((childId) => {
        if (childId === id) return
        getDescendants(childId).forEach((desc) => acc.add(desc))
      })
      descendantCache.set(id, acc)
      return acc
    }

    const collectTokensForCategory = (id: string): Set<string> => {
      const tokens = new Set<string>()
      const descendants = getDescendants(id)
      descendants.forEach((descId) => {
        tokens.add(descId)
        const handle = categoryMap[descId]?.handle
        if (handle) {
          tokens.add(handle)
          tokens.add(`handle:${handle}`)
        }
        const title = categoryMap[descId]?.title
        if (title) {
          tokens.add(`label:${humanizeCategoryLabel(title)}`)
        }
      })
      return tokens
    }

    const options: SavingsCategoryOption[] = []
    const coveredTokens = new Set<string>()

    entries.forEach(([id, entry]) => {
      const tokenSet = collectTokensForCategory(id)
      tokenSet.forEach((token) => coveredTokens.add(token))
      const count = Array.from(tokenSet).reduce((sum, token) => sum + (countMap.get(token) || 0), 0)
      const minPrice = Array.from(tokenSet).reduce<number | undefined>((min, token) => {
        const price = minPriceMap.get(token)
        if (price === undefined) return min
        if (min === undefined || price < min) return price
        return min
      }, undefined)
      const label =
        entry?.title || (entry?.handle ? humanizeCategoryLabel(entry.handle) : humanizeCategoryLabel(id))
      options.push({
        id,
        label,
        matchIds: Array.from(tokenSet),
        count,
        minPrice,
        categoryId: id,
        categoryHandle: entry?.handle,
      })
    })

    const extraTokens = Array.from(countMap.keys()).filter((token) => !coveredTokens.has(token))
    extraTokens.forEach((token) => {
      const normalizedHandle = token.startsWith('handle:') ? token.replace(/^handle:/i, '') : undefined
      const matchTokens = normalizedHandle ? [token, normalizedHandle] : [token]
      options.push({
        id: token,
        label: labelHintMap.get(token) || humanizeCategoryLabel(token),
        matchIds: matchTokens,
        count: countMap.get(token) || 0,
        minPrice: minPriceMap.get(token),
        categoryHandle: normalizedHandle,
      })
    })

    options.sort((a, b) => {
      const aIsReal = Boolean(categoryMap[a.id])
      const bIsReal = Boolean(categoryMap[b.id])
      if (aIsReal !== bIsReal) return aIsReal ? -1 : 1
      return a.label.localeCompare(b.label)
    })

    return options
  }, [related, categoryMap])
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

  const addVariantToCart = async (variantId?: string, qty = 1, label?: string) => {
    if (!variantId) {
      notifyCartUnavailable()
      return
    }
    try {
      // Get guest cart ID if available
      const guestCartId = typeof window !== 'undefined' ? localStorage.getItem('guest_cart_id') : null
      
      // Ensure cart exists
      await fetch('/api/medusa/cart', { 
        method: 'POST', 
        credentials: 'include',
        headers: {
          ...(guestCartId ? { 'x-guest-cart-id': guestCartId } : {}),
        },
      })
      
      // Add item to cart
      const res = await fetch('/api/medusa/cart/line-items', {
        method: 'POST',
        headers: { 
          'content-type': 'application/json',
          ...(guestCartId ? { 'x-guest-cart-id': guestCartId } : {}),
        },
        body: JSON.stringify({ variant_id: variantId, quantity: qty }),
        credentials: 'include',
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        const message =
          (payload && (payload.error || payload.message)) || 'Unable to add to cart right now.'
        throw new Error(message)
      }
      
      // Store guest cart ID if returned
      if (payload?.guestCartId && typeof window !== 'undefined' && typeof payload.guestCartId === 'string') {
        localStorage.setItem('guest_cart_id', payload.guestCartId)
      }
      
      // Sync cart count
      if (payload) {
        syncFromCartPayload(payload)
      }
      
      // Refresh cart to ensure count is up to date
      await refreshCart()
      
      notifyCartAddSuccess(label ?? product?.title ?? 'Item', qty, goToCart)
    } catch (err) {
      console.warn('addVariantToCart failed', err)
      const message = err instanceof Error ? err.message : undefined
      notifyCartAddError(message)
    }
  }

  const handleAddToCart = async () => {
    await addVariantToCart(product?.variant_id, quantity, product?.title)
  }

  const handleBuyNow = () => {
    notifyCheckoutComingSoon()
  }

  const handleAddToWishlist = async () => {
    await addProductToWishlist(product?.id, product?.title)
  }

  const handleSaveForLater = () => {
    void addProductToWishlist(product?.id, product?.title)
  }

  const addProductToWishlist = async (id?: string, label?: string) => {
    if (!id) {
      toast.error('This product is unavailable.')
      return
    }
    if (!customer) {
      notifyWishlistLogin(() => router.push('/login'))
      return
    }
    const existing = (customer.metadata as Record<string, unknown> | undefined)?.wishlist
    if (Array.isArray(existing) && existing.map((v) => v?.toString()).includes(id)) {
      toast.info('Already in your wishlist.')
      return
    }
    if (wishlistBusy) return
    try {
      setWishlistBusy(true)
      const res = await fetch('/api/medusa/wishlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId: id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const message =
          (data && (data.error || data.message)) || 'Unable to save to wishlist.'
        toast.error(message)
        return
      }
      if (data?.wishlist && Array.isArray(data.wishlist)) {
        setCustomer({
          ...(customer || {}),
          metadata: {
            ...(customer?.metadata || {}),
            wishlist: data.wishlist,
          },
        })
      }
      notifyWishlistSuccess(label ?? 'Item')
    } catch (err) {
      console.warn('addProductToWishlist failed', err)
      toast.error('Unable to save to wishlist. Please try again.')
    } finally {
      setWishlistBusy(false)
    }
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
    <div className="flex min-h-screen flex-col bg-[#f3f8f3] font-sans overflow-x-hidden touch-pan-y">
      <style>{`
        :root {
          --detail-accent: #7bc24f;
          --detail-accent-soft: rgba(123, 194, 79, 0.12);
          --detail-border: #dfe9df;
        }
      `}</style>
      <main className="w-full max-w-7xl mx-auto px-4 py-8 lg:py-12 flex-1 scroll-smooth">
        <Breadcrumbs items={breadcrumbItems} pillClassName={breadcrumbPillClass} />

        {productLoading ? (
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
            {/* ====== MAIN TWO-COLUMN: LEFT = STICKY GALLERY, RIGHT = SCROLLABLE SUMMARY ====== */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mb-10 items-start max-w-full overflow-hidden">
              {/* LEFT: Sticky Image/Gallery */}
              <div className="relative lg:sticky lg:top-10 self-start w-full max-w-full overflow-hidden">
                <ProductGallery
                  images={galleryImages}
                  selectedIndex={selectedImage}
                  onSelect={setSelectedImage}
                  fallback={FALLBACK_IMAGE}
                  productTitle={product.title}
                  productPrice={product.price}
                  productHighlights={highlights}
                />

                <button
                  type="button"
                  onClick={handleAddToWishlist}
                  className="sm:hidden absolute top-3 right-3 inline-flex items-center justify-center rounded-full border border-rose-200 bg-white/90 text-rose-500 p-2 shadow"
                  aria-label="Add to wishlist"
                >
                  <Heart className="w-6 h-6" fill={isWishlisted ? 'currentColor' : 'none'} />
                </button>
              </div>

              {/* RIGHT: Scrollable Summary */}
              <div
                ref={summaryScrollRef}
                className="w-full min-w-0 space-y-5 lg:pl-4 lg:pr-2 lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto lg:pr-3 lg:-mr-3 lg:scrollbar-thin lg:scrollbar-thumb-transparent lg:scrollbar-track-transparent"
                style={{ scrollbarWidth: 'none' }}
              >
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
                  isWishlisted={isWishlisted}
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

            {/* ====== REST OF THE PAGE ====== */}
            <section className="mt-12">
              <div className="relative overflow-hidden border border-emerald-100 bg-gradient-to-b from-emerald-50 via-white to-green-50 shadow-xl transition duration-700 hover:-translate-y-0.5 hover:shadow-2xl">
                <div className="pointer-events-none absolute -left-10 top-0 h-48 w-48 rounded-full bg-emerald-300/20 blur-3xl animate-pulse" aria-hidden="true" />
                <div className="pointer-events-none absolute -bottom-10 right-0 h-40 w-40 rounded-full bg-lime-300/20 blur-3xl animate-[pulse_5s_linear_infinite]" aria-hidden="true" />
                <div className="relative z-10 space-y-8 p-6 sm:p-8 lg:p-12">
                  <div className="space-y-6 text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/40 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700 backdrop-blur">
                      Smart savings
                    </div>
                    <div className="space-y-4 max-w-4xl mx-auto">
                      <h2 className="text-3xl font-bold text-slate-900 sm:text-[2.4rem] sm:leading-tight">
                        {`Put your \u20B9${Math.round(savedAmount).toLocaleString('en-IN')} savings back into something delightful`}
                      </h2>
                    </div>
                  </div>
                  <div className="relative   p-4 sm:p-6 lg:p-8">
                    <ProductSavingsExplorer
                      savedAmount={savedAmount}
                      products={related}
                      loading={loadingRelated}
                      currentProductId={product.id}
                      categoryOptions={savingsCategoryOptions}
                      formatCurrency={(value) => inr.format(value)}
                      onQuickAdd={async (item) => addVariantToCart(item.variant_id, 1, item.name)}
                      onWishlist={(item) => {
                        void addProductToWishlist(item.id?.toString(), item.name)
                      }}
                    />
                  </div>
                </div>
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
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                                  void addProductToWishlist(item.id?.toString(), item.name)
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
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 px-2 pt-20 pb-4 md:px-6 md:py-10">
          <div className="relative w-full max-w-2xl max-h-[62vh] md:max-h-[58vh] bg-white shadow-2xl border border-slate-100 rounded-t-3xl md:rounded-3xl flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-4 py-4 border-b bg-white sticky top-0 z-10">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400 mb-1">Compare</p>
                <h3 className="text-xl font-semibold text-slate-900">Compare similar products</h3>
                <p className="text-sm text-slate-500">
                  Select items from the same category to see a quick spec comparison.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompareModalOpen(false)}
                className="flex items-center justify-center gap-2 rounded-full border border-slate-200 px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                aria-label="Close compare modal"
              >
                <X className="w-4 h-4" />
                <span className="hidden md:inline">Close</span>
              </button>
            </div>

            <div className="px-4 py-4 border-b bg-white sticky top-[92px] z-10">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs sm:text-sm font-medium text-slate-600">
                  Brand
                  <select
                    value={compareFilters.brand}
                    onChange={(e) => setCompareFilters((prev) => ({ ...prev, brand: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                  >
                    {availableBrands.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand === 'All' ? 'All brands' : brand}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs sm:text-sm font-medium text-slate-600">
                  Color
                  <select
                    value={compareFilters.color}
                    onChange={(e) => setCompareFilters((prev) => ({ ...prev, color: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                  >
                    {availableColors.map((color) => (
                      <option key={color} value={color}>
                        {color === 'All' ? 'All colors' : color}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
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
                            {item.brand || 'Other'} · {item.color || 'All'}
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

            <div className="px-4 py-4 border-t bg-white flex flex-wrap items-center justify-between gap-3 sticky bottom-0">
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
