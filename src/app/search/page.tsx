"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Heart, SearchX, SlidersHorizontal, Star } from "lucide-react"
import Image from "next/image"

type SearchProduct = {
  id: string
  handle?: string
  title?: string
  description?: string
  thumbnail?: string
  brand?: string
  rating?: number
  price?: number | string
  mrp?: number | string
  discount?: number
}

const SEARCH_PAGE_SIZE = 24

const priceFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const PRICE_OPTIONS = [
  { label: "Under \u20B91,000", value: "under1000" },
  { label: "\u20B91,000 - \u20B95,000", value: "1000-5000" },
  { label: "\u20B95,000 - \u20B910,000", value: "5000-10000" },
  { label: "\u20B910,000 - \u20B920,000", value: "10000-20000" },
  { label: "Over \u20B920,000", value: "over20000" },
] as const

function toSafePrice(value: SearchProduct["price"]): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toSafeAmount(value: number | string | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function StarRow({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, idx) => {
        const filled = idx < count
        return (
          <Star
            key={idx}
            className={filled ? "h-3.5 w-3.5 fill-amber-400 text-amber-400" : "h-3.5 w-3.5 text-slate-300"}
          />
        )
      })}
    </span>
  )
}

function SearchPageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const q = params.get("q")?.trim() || ""
  const category = params.get("category")?.trim() || ""
  const categoryId = params.get("categoryId")?.trim() || ""
  const collection = params.get("collection")?.trim() || ""
  const collectionId = params.get("collectionId")?.trim() || ""
  const requestedPage = Math.max(1, parseInt(params.get("page") || "1", 10) || 1)

  const [products, setProducts] = useState<SearchProduct[]>([])
  const [filtered, setFiltered] = useState<SearchProduct[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const [minRating, setMinRating] = useState<number | null>(null)
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [priceRange, setPriceRange] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(totalCount / SEARCH_PAGE_SIZE))
  const currentPage = Math.min(requestedPage, totalPages)

  useEffect(() => {
    if (!q) {
      setProducts([])
      setFiltered([])
      setTotalCount(0)
      return
    }

    let cancelled = false

    async function fetchProducts() {
      setLoading(true)
      try {
        const query = new URLSearchParams({
          q,
          page: String(requestedPage),
          pageSize: String(SEARCH_PAGE_SIZE),
        })
        if (categoryId) query.set("categoryId", categoryId)
        else if (category) query.set("category", category)
        if (collectionId) query.set("collectionId", collectionId)
        else if (collection) query.set("collection", collection)

        const res = await fetch(`/api/search?${query.toString()}`)
        const data = await res.json()
        if (cancelled) return
        const result = Array.isArray(data)
          ? (data as SearchProduct[])
          : Array.isArray(data?.products)
            ? (data.products as SearchProduct[])
            : []
        setProducts(result)
        setFiltered(result)
        setTotalCount(typeof data?.count === "number" ? data.count : result.length)
      } catch {
        if (!cancelled) {
          setProducts([])
          setFiltered([])
          setTotalCount(0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchProducts()
    return () => {
      cancelled = true
    }
  }, [q, category, categoryId, collection, collectionId, requestedPage])

  const allBrands = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))) as string[],
    [products]
  )
  const visibleBrands = allBrands.slice(0, 8)

  useEffect(() => {
    let result = [...products]
    if (minRating) result = result.filter((p) => (p.rating || 0) >= minRating)
    if (selectedBrands.length > 0) {
      result = result.filter((p) => p.brand && selectedBrands.includes(p.brand))
    }
    if (priceRange) {
      result = result.filter((p) => {
        const price = toSafePrice(p.price)
        if (priceRange === "under1000") return price < 1000
        if (priceRange === "1000-5000") return price >= 1000 && price <= 5000
        if (priceRange === "5000-10000") return price > 5000 && price <= 10000
        if (priceRange === "10000-20000") return price > 10000 && price <= 20000
        if (priceRange === "over20000") return price > 20000
        return true
      })
    }
    setFiltered(result)
  }, [minRating, selectedBrands, priceRange, products])

  const hasFilters = !!minRating || selectedBrands.length > 0 || !!priceRange
  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((item) => item !== brand) : [...prev, brand]
    )
  }
  const clearFilters = () => {
    setMinRating(null)
    setSelectedBrands([])
    setPriceRange(null)
  }
  const goToPage = (page: number) => {
    const safe = Math.max(1, Math.min(page, totalPages))
    const next = new URLSearchParams(params.toString())
    if (safe <= 1) next.delete("page")
    else next.set("page", String(safe))
    router.replace(`/search?${next.toString()}`, { scroll: false })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/20 to-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-5 rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Search Results</p>
              <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                {q ? `Results for "${q}"` : "Search products"}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {loading
                  ? "Looking for the best matches..."
                  : `${totalCount} product${totalCount === 1 ? "" : "s"} found`}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[260px_1fr] lg:gap-6">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-800">
                <SlidersHorizontal className="h-4 w-4 text-emerald-700" />
                Filters
              </h2>
              {hasFilters ? (
                <button onClick={clearFilters} className="text-xs font-semibold text-rose-600">Clear all</button>
              ) : null}
            </div>
            <div className="space-y-5">
              {allBrands.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Brand</h3>
                  <div className="space-y-1">
                    {visibleBrands.map((brand) => (
                      <label key={brand} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">
                        <input type="checkbox" checked={selectedBrands.includes(brand)} onChange={() => toggleBrand(brand)} className="h-4 w-4 accent-emerald-600" />
                        <span className="text-sm text-slate-700">{brand}</span>
                      </label>
                    ))}
                  </div>
                </section>
              ) : null}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Price</h3>
                <div className="space-y-1">
                  {PRICE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">
                      <input type="radio" name="price" checked={priceRange === option.value} onChange={() => setPriceRange(priceRange === option.value ? null : option.value)} className="h-4 w-4 accent-emerald-600" />
                      <span className="text-sm text-slate-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            </div>
          </aside>

          <main>
            {loading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div key={`search-skeleton-${idx}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="h-48 animate-pulse bg-slate-100" />
                    <div className="space-y-3 p-4">
                      <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <SearchX className="mx-auto mb-3 h-6 w-6 text-slate-500" />
                <h2 className="text-xl font-semibold text-slate-900">No results found</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {hasFilters ? "Try removing some filters." : `No products match "${q}" yet.`}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                  {filtered.map((product) => {
                    const price = toSafePrice(product.price)
                    const mrp = toSafeAmount(product.mrp)
                    const discount = typeof product.discount === "number"
                      ? product.discount
                      : (mrp > price && price > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0)
                    const href = `/productDetail/${product.handle || product.id}?id=${encodeURIComponent(product.id)}`
                    return (
                      <Link key={product.id} href={href} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                        <div className="relative h-48 overflow-hidden bg-slate-50">
                          {product.thumbnail ? (
                            <Image src={product.thumbnail} alt={product.title || "Product"} fill className="object-contain p-3" sizes="(max-width: 640px) 50vw, 25vw" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-sm text-slate-400">No image</div>
                          )}
                          {discount > 0 ? (
                            <span className="absolute left-2 top-2 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">{discount}% off</span>
                          ) : null}
                          <button type="button" className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-slate-500" aria-label="Wishlist" onClick={(e) => e.preventDefault()}>
                            <Heart className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex flex-1 flex-col gap-1.5 p-3.5">
                          {product.brand ? <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{product.brand}</p> : null}
                          <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{product.title}</h3>
                          {typeof product.rating === "number" && product.rating > 0 ? <StarRow count={Math.min(5, Math.round(product.rating))} /> : null}
                          <div className="mt-auto flex items-baseline gap-2 pt-1">
                            <span className="text-base font-bold text-slate-900">{priceFormatter.format(price)}</span>
                            {mrp > price ? <span className="text-xs text-slate-400 line-through">{priceFormatter.format(mrp)}</span> : null}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
                {totalPages > 1 ? (
                  <div className="mt-8 flex items-center justify-center gap-3">
                    <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40">
                      <ChevronLeft className="h-4 w-4" /> Prev
                    </button>
                    <span className="text-sm text-slate-600">Page {currentPage} of {totalPages}</span>
                    <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40">
                      Next <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

function SearchPageFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/20 to-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-5 rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-5">
          <p className="text-sm text-slate-600">Loading search...</p>
        </div>
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchPageFallback />}>
      <SearchPageContent />
    </Suspense>
  )
}
