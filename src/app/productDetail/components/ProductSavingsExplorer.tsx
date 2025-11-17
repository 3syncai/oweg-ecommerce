'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Heart, ShoppingCart } from 'lucide-react'
import type { RelatedProduct, SavingsCategoryOption } from '../types'

type ProductSavingsExplorerProps = {
  savedAmount: number
  products: RelatedProduct[]
  loading: boolean
  currentProductId?: string | null
  categoryOptions: SavingsCategoryOption[]
  formatCurrency: (value: number) => string
  onQuickAdd: (product: RelatedProduct) => Promise<void> | void
  onWishlist: (product: RelatedProduct) => void
}

const QUICK_ADD_AMOUNTS = [100, 200, 500]
const MAX_CUSTOM_AMOUNT = 50000
const RUPEE_SYMBOL = '\u20B9'
const FALLBACK_IMAGE = '/oweg_logo.png'

type CategoryCacheEntry = {
  items: RelatedProduct[]
  budget: number
}

const clampAmount = (value: number) => Math.max(0, Math.min(MAX_CUSTOM_AMOUNT, Math.round(value)))

const collectCategoryTokens = (item: RelatedProduct) =>
  Array.from(
    new Set(
      [
        ...(item.category_ids || []),
        ...Object.keys(item.category_labels || {}),
      ]
        .map((value) => (value == null ? '' : String(value).trim()))
        .filter((value) => value.length > 0)
    )
  )

const normalizeFetchedProduct = (product: RelatedProduct, fallbackCategory?: string): RelatedProduct => {
  const image = product.image || (product as { thumbnail?: string }).thumbnail || FALLBACK_IMAGE
  const categoryIds = collectCategoryTokens(product)
  if (fallbackCategory && !categoryIds.includes(fallbackCategory)) {
    categoryIds.push(fallbackCategory)
  }
  return {
    ...product,
    image,
    category_ids: categoryIds,
  }
}

const ProductSavingsExplorer = ({
  savedAmount,
  products,
  loading,
  currentProductId,
  categoryOptions,
  formatCurrency,
  onQuickAdd,
  onWishlist,
}: ProductSavingsExplorerProps) => {
  const [addedAmount, setAddedAmount] = useState(0)
  const [debouncedAddedAmount, setDebouncedAddedAmount] = useState(0)
  const [customInput, setCustomInput] = useState('0')
  const [selectedCategory, setSelectedCategory] = useState<'all' | string>('all')
  const [addingProductId, setAddingProductId] = useState<string | number | null>(null)
  const [categoryCache, setCategoryCache] = useState<Record<string, CategoryCacheEntry>>({})
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const hasCategoryFilters = categoryOptions.length > 0

  useEffect(() => {
    setAddedAmount(0)
    setDebouncedAddedAmount(0)
    setSelectedCategory('all')
  }, [savedAmount, products])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedAddedAmount(addedAmount), 250)
    return () => window.clearTimeout(timer)
  }, [addedAmount])

  useEffect(() => {
    setCustomInput(String(addedAmount))
  }, [addedAmount])

  useEffect(() => {
    if (selectedCategory === 'all') return
    const exists = categoryOptions.some((option) => option.id === selectedCategory)
    if (!exists) {
      setSelectedCategory('all')
    }
  }, [categoryOptions, selectedCategory])

  const selectedOption = useMemo(
    () => categoryOptions.find((option) => option.id === selectedCategory),
    [categoryOptions, selectedCategory]
  )

  const liveBudget = Math.max(0, Math.round(savedAmount)) + Math.max(0, Math.round(debouncedAddedAmount))

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.price - b.price)
  }, [products])

  const baseProducts = useMemo(() => {
    return sortedProducts.filter((item) => {
      if (currentProductId && String(item.id) === String(currentProductId)) return false
      const price = Number(item.price)
      if (!Number.isFinite(price) || price <= 0 || price > liveBudget) return false
      return true
    })
  }, [sortedProducts, liveBudget, currentProductId])

  const tokenFilteredProducts = useMemo(() => {
    if (!selectedOption || selectedCategory === 'all') return baseProducts
    const allowed = new Set(selectedOption.matchIds)
    if (!allowed.size) return []
    return baseProducts.filter((item) => {
      const tokens = collectCategoryTokens(item)
      return tokens.some((token) => allowed.has(token))
    })
  }, [baseProducts, selectedCategory, selectedOption])

  const cachedCategoryProducts = useMemo(() => {
    if (selectedCategory === 'all') return []
    const cacheEntry = categoryCache[selectedCategory]
    if (!cacheEntry) return []
    return cacheEntry.items.filter((item) => {
      if (currentProductId && String(item.id) === String(currentProductId)) return false
      const price = Number(item.price)
      return Number.isFinite(price) && price > 0 && price <= liveBudget
    })
  }, [categoryCache, selectedCategory, currentProductId, liveBudget])

  const activeProducts =
    selectedCategory === 'all'
      ? baseProducts
      : cachedCategoryProducts.length
        ? cachedCategoryProducts
        : tokenFilteredProducts

  const filteredTotal = useMemo(
    () => activeProducts.reduce((sum, item) => sum + (Number.isFinite(item.price) ? item.price : 0), 0),
    [activeProducts]
  )

  useEffect(() => {
    if (selectedCategory === 'all') return
    if (!selectedOption) return
    const targetBudget = Math.max(0, Math.round(liveBudget))
    const cacheEntry = categoryCache[selectedCategory]
    if (cacheEntry && cacheEntry.budget >= targetBudget) return

    const fetchableId = selectedOption.categoryId || selectedOption.categoryHandle || selectedOption.label
    if (!fetchableId) return

    const params = new URLSearchParams()
    params.set('limit', '48')
    if (targetBudget > 0) {
      params.set('priceMax', String(targetBudget))
    }
    if (selectedOption.categoryId) {
      params.set('categoryId', selectedOption.categoryId)
    } else if (selectedOption.categoryHandle) {
      params.set('category', selectedOption.categoryHandle)
    } else {
      params.set('category', selectedOption.label)
    }

    let ignore = false
    setCategoryLoading(true)
    setCategoryError(null)

    ;(async () => {
      try {
        const res = await fetch(`/api/medusa/products?${params.toString()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('failed')
        const data = await res.json()
        if (ignore) return
        const items: RelatedProduct[] = (Array.isArray(data?.products) ? data.products : [])
          .map((item: RelatedProduct) => normalizeFetchedProduct(item, selectedOption.categoryId))
          .filter((item: RelatedProduct) => {
            if (currentProductId && String(item.id) === String(currentProductId)) return false
            const price = Number(item.price)
            return Number.isFinite(price) && price > 0 && price <= targetBudget
          })
        setCategoryCache((prev) => ({
          ...prev,
          [selectedCategory]: { items, budget: targetBudget },
        }))
      } catch {
        if (!ignore) setCategoryError('Unable to load this category right now.')
      } finally {
        if (!ignore) setCategoryLoading(false)
      }
    })()

    return () => {
      ignore = true
    }
  }, [selectedCategory, selectedOption, liveBudget, categoryCache, currentProductId])

  const handleChipClick = (delta: number) => {
    setAddedAmount((prev) => clampAmount(prev + delta))
  }

  const handleManualChange = (value: string) => {
    setCustomInput(value)
    if (!value.trim()) {
      setAddedAmount(0)
      return
    }
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    setAddedAmount(clampAmount(parsed))
  }

  const handleQuickAdd = async (product: RelatedProduct) => {
    setAddingProductId(product.id)
    try {
      await onQuickAdd(product)
    } finally {
      setAddingProductId((current) => (current === product.id ? null : current))
    }
  }

  const effectiveLoading = loading || (selectedCategory !== 'all' && categoryLoading && !cachedCategoryProducts.length)
  const showEmptyState = !effectiveLoading && activeProducts.length === 0

  return (
    <div className="rounded-3xl border border-green-100 bg-gradient-to-b from-white via-green-50 to-white p-4 sm:p-6 space-y-4 shadow-lg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="text-center sm:text-left">
          <p className="text-[11px] uppercase tracking-[0.35em] text-green-600">You saved</p>
          <p className="text-2xl sm:text-3xl font-semibold text-slate-900">{formatCurrency(Math.max(savedAmount, 0))}</p>
        </div>
        <div className="text-sm text-slate-600 text-center sm:text-right">
          Live budget:{' '}
          <span className="font-semibold text-slate-900">{formatCurrency(Math.max(liveBudget, 0))}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          {QUICK_ADD_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              className="rounded-full border border-green-200 bg-white px-3 py-1.5 text-sm font-medium text-green-700 transition hover:bg-green-50"
              onClick={() => handleChipClick(amount)}
            >
              +{RUPEE_SYMBOL}
              {amount.toLocaleString('en-IN')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-green-200 bg-white px-3 py-1.5 text-sm text-slate-600">
          <span className="text-xs uppercase tracking-wide text-slate-400">+{RUPEE_SYMBOL}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            className="w-full sm:w-24 border-0 bg-transparent text-base font-semibold text-slate-900 focus:outline-none"
            value={customInput}
            onChange={(event) => handleManualChange(event.target.value)}
            aria-label="Add custom amount"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <label htmlFor="savings-category" className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Category
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-1 sm:items-center sm:gap-3">
          <select
            id="savings-category"
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:cursor-not-allowed disabled:bg-slate-50"
            value={hasCategoryFilters ? selectedCategory : 'all'}
            onChange={(event) => {
              if (!hasCategoryFilters) return
              setSelectedCategory(event.target.value)
            }}
            aria-disabled={!hasCategoryFilters}
          >
            <option value="all">
              All categories{products.length ? ` (${products.length})` : ''}
            </option>
            {categoryOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {`${option.label}${option.count ? ` (${option.count})` : ''}`}
              </option>
            ))}
          </select>
          {!hasCategoryFilters && (
            <span className="text-xs text-slate-400">
              Category filters appear when matching items include category tags.
            </span>
          )}
        </div>
      </div>

     

      
      
      {effectiveLoading ? (
        <div className="text-sm text-slate-500">
          {selectedCategory === 'all'
            ? 'Loading smart picks for this budget...'
            : `Fetching ${selectedOption?.label || 'category'} picks...`}
        </div>
      ) : showEmptyState ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-600">
          {selectedCategory === 'all'
            ? 'No items fit within this budget yet. Try increasing the add-on amount.'
            : categoryError || 'No items from this category fit in the current budget. Try adding a bit more.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {activeProducts.map((item) => {
            const slug = encodeURIComponent(String(item.handle || item.id))
            const href = `/productDetail/${slug}?id=${encodeURIComponent(String(item.id))}`
            const isAdding = addingProductId === item.id
            const canQuickAdd = Boolean(item.variant_id)
            return (
              <div key={item.id} className="flex gap-3 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-sm">
                <Link href={href} className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-slate-50">
                  <Image
                    src={item.image || FALLBACK_IMAGE}
                    alt={item.name}
                    fill
                    sizes="80px"
                    className="object-contain p-2"
                  />
                  {item.discount > 0 && (
                    <span className="absolute left-1 top-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {item.discount}% OFF
                    </span>
                  )}
                </Link>
                <div className="flex flex-1 flex-col gap-2">
                  <Link href={href} className="text-sm font-semibold text-slate-900 line-clamp-2 hover:text-green-700">
                    {item.name}
                  </Link>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-base font-semibold text-slate-900">{formatCurrency(item.price)}</span>
                    <span className="text-xs text-slate-400 line-through">{formatCurrency(item.mrp)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(item)}
                      disabled={isAdding || !canQuickAdd}
                      className={`h-9 w-9 rounded-full border text-white transition ${
                        canQuickAdd
                          ? 'border-green-500 bg-green-600 hover:bg-green-700 disabled:border-green-200 disabled:bg-green-300'
                          : 'border-slate-200 bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                      aria-label="Add this product to cart"
                    >
                      {isAdding ? (
                        <span className="block h-full w-full animate-pulse rounded-full bg-white/40" />
                      ) : (
                        <ShoppingCart className="mx-auto h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onWishlist(item)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-pink-200 bg-white text-pink-500 transition hover:border-pink-400 hover:text-pink-600"
                      aria-label="Add this product to wishlist"
                    >
                      <Heart className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ProductSavingsExplorer
