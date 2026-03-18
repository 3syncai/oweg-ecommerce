"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Heart, SearchX, SlidersHorizontal, Star } from "lucide-react"
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

const priceFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const PRICE_OPTIONS = [
  { label: "Under ₹1,000", value: "under1000" },
  { label: "₹1,000 - ₹5,000", value: "1000-5000" },
  { label: "₹5,000 - ₹10,000", value: "5000-10000" },
  { label: "₹10,000 - ₹20,000", value: "10000-20000" },
  { label: "Over ₹20,000", value: "over20000" },
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

export default function SearchPage() {
  const params = useSearchParams()
  const q = params.get("q")?.trim() || ""

  const [products, setProducts] = useState<SearchProduct[]>([])
  const [filtered, setFiltered] = useState<SearchProduct[]>([])
  const [loading, setLoading] = useState(false)

  const [minRating, setMinRating] = useState<number | null>(null)
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [showAllBrands, setShowAllBrands] = useState(false)
  const [priceRange, setPriceRange] = useState<string | null>(null)

  useEffect(() => {
    if (!q) {
      setProducts([])
      setFiltered([])
      return
    }

    let cancelled = false

    async function fetchProducts() {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        if (cancelled) return
        const result = Array.isArray(data) ? (data as SearchProduct[]) : []
        setProducts(result)
        setFiltered(result)
      } catch {
        if (!cancelled) {
          setProducts([])
          setFiltered([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchProducts()

    return () => {
      cancelled = true
    }
  }, [q])

  const allBrands = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))) as string[],
    [products]
  )

  const visibleBrands = showAllBrands ? allBrands : allBrands.slice(0, 8)

  useEffect(() => {
    let result = [...products]

    if (minRating) {
      result = result.filter((p) => (p.rating || 0) >= minRating)
    }

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
                  : `${filtered.length} product${filtered.length === 1 ? "" : "s"} found`}
              </p>
            </div>
            {hasFilters ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Filters applied
              </span>
            ) : null}
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
                <button
                  onClick={clearFilters}
                  className="text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                >
                  Clear all
                </button>
              ) : null}
            </div>

            <div className="space-y-5">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Customer Review
                </h3>
                <div className="space-y-2">
                  {[4, 3, 2, 1].map((star) => (
                    <label key={star} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={minRating === star}
                        onChange={() => setMinRating(minRating === star ? null : star)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <span className="inline-flex items-center gap-1 text-sm text-slate-700">
                        <StarRow count={star} />
                        <span>& up</span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              {allBrands.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Brand</h3>
                  <div className="space-y-1">
                    {visibleBrands.map((brand) => (
                      <label key={brand} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selectedBrands.includes(brand)}
                          onChange={() => toggleBrand(brand)}
                          className="h-4 w-4 accent-emerald-600"
                        />
                        <span className="text-sm text-slate-700">{brand}</span>
                      </label>
                    ))}
                  </div>

                  {allBrands.length > 8 ? (
                    <button
                      onClick={() => setShowAllBrands((prev) => !prev)}
                      className="mt-2 text-xs font-semibold text-emerald-700 transition hover:text-emerald-800"
                    >
                      {showAllBrands ? "See less" : "See more"}
                    </button>
                  ) : null}
                </section>
              ) : null}

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Price</h3>
                <div className="space-y-1">
                  {PRICE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">
                      <input
                        type="radio"
                        name="price"
                        checked={priceRange === option.value}
                        onChange={() => setPriceRange(priceRange === option.value ? null : option.value)}
                        className="h-4 w-4 accent-emerald-600"
                      />
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
                      <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                      <div className="h-6 w-1/3 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <SearchX className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900">No results found</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {hasFilters ? "Try removing some filters to broaden your search." : `No products match "${q}" yet.`}
                </p>
                {hasFilters ? (
                  <button
                    onClick={clearFilters}
                    className="mt-4 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((product) => {
                  const price = toSafePrice(product.price)
                  const mrp = toSafeAmount(product.mrp)
                  const discount = typeof product.discount === "number"
                    ? product.discount
                    : (mrp > price && price > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0)
                  const href = `/productDetail/${product.handle || product.id}?id=${encodeURIComponent(product.id)}`

                  return (
                    <Link
                      key={product.id}
                      href={href}
                      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <div className="relative h-48 overflow-hidden bg-slate-50">
                        {product.thumbnail ? (
                          <Image
                            src={product.thumbnail}
                            alt={product.title || "Product"}
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                            className="h-full w-full object-contain p-3 transition duration-300 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-slate-400">No Image</div>
                        )}

                        {discount > 0 ? (
                          <span className="absolute left-2 top-2 rounded-full bg-rose-600 px-2 py-1 text-[10px] font-semibold text-white">
                            {discount}% off
                          </span>
                        ) : null}

                        <button
                          onClick={(event) => event.preventDefault()}
                          className="absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm"
                          aria-label="Wishlist"
                        >
                          <Heart className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex flex-1 flex-col p-3">
                        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold text-slate-900 transition group-hover:text-emerald-700">
                          {product.title || "Untitled product"}
                        </h3>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">{product.description || ""}</p>

                        {typeof product.rating === "number" && product.rating > 0 ? (
                          <div className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600">
                            <StarRow count={Math.round(product.rating)} />
                            <span>{product.rating.toFixed(1)}</span>
                          </div>
                        ) : null}

                        <div className="mt-auto pt-3">
                          <div className="flex items-end gap-2">
                            <span className="text-base font-bold text-slate-900">{priceFormatter.format(price)}</span>
                            {mrp > price && price > 0 ? <span className="text-xs text-slate-400 line-through">{priceFormatter.format(mrp)}</span> : null}
                          </div>
                          <span className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition group-hover:bg-emerald-700">
                            View Product
                          </span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
