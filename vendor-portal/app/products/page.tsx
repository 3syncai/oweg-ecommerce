"use client"

import { useCallback, useEffect, useState } from "react"
import { Container, Heading, Text, Button } from "@medusajs/ui"
import { ArchiveBox, MagnifyingGlass, Plus, ArrowUpRightMini, Tag, ChevronLeft, ChevronRight } from "@medusajs/icons"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import EmptyState from "@/components/EmptyState"
import StatCard from "@/components/dashboard/StatCard"
import ProductStatus, { resolveProductStatus } from "@/components/dashboard/ProductStatus"
import StatusDot from "@/components/dashboard/StatusDot"
import { vendorProductsApi } from "@/lib/api/client"
import { useVendorLive } from "@/lib/useVendorLive"
import { hasPageCache, pageCacheKey, peekPageCache, writePageCache } from "@/lib/page-cache"
import { useRouter } from "next/navigation"
import Image from "next/image"

type Product = {
  id: string
  title: string
  status: string
  created_at: string
  thumbnail?: string
  handle?: string
  metadata?: {
    approval_status?: string
    vendor_id?: string
    tax_code?: string | null
    gst_rate?: number | string | null
  }
}

const PAGE_SIZE = 20

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

const ProductThumbnail = ({ product }: { product: Product }) => {
  if (product.thumbnail) {
    return (
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-ui-border-base/70 bg-ui-bg-base-hover">
        <Image
          src={product.thumbnail}
          alt={product.title}
          fill
          className="object-cover"
          unoptimized
        />
      </div>
    )
  }

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-ui-border-base/70 bg-ui-bg-base-hover text-sm font-semibold text-ui-fg-muted">
      {product.title?.[0]?.toUpperCase() || "P"}
    </div>
  )
}

const VendorProductsPage = () => {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft" | "pending">("all")
  const [page, setPage] = useState(1)

  type ProductsCachePayload = {
    products: Product[]
    totalFiltered: number
    counts: { total: number; published: number; draft: number; pending: number }
  }

  const productsCacheKey = pageCacheKey("products", {
    status: statusFilter,
    page,
    q: searchDebounced || undefined,
  })
  const cachedProducts = peekPageCache<ProductsCachePayload>(productsCacheKey)

  const [products, setProducts] = useState<Product[]>(() => cachedProducts?.products ?? [])
  const [loading, setLoading] = useState(() => !hasPageCache(productsCacheKey))
  const [error, setError] = useState<string | null>(null)
  const [totalFiltered, setTotalFiltered] = useState(() => cachedProducts?.totalFiltered ?? 0)
  const [counts, setCounts] = useState(
    () => cachedProducts?.counts ?? { total: 0, published: 0, draft: 0, pending: 0 }
  )

  useEffect(() => {
    const id = window.setTimeout(() => setSearchDebounced(search.trim()), 300)
    return () => window.clearTimeout(id)
  }, [search])

  const loadProducts = useCallback(async () => {
    const cacheKey = pageCacheKey("products", {
      status: statusFilter,
      page,
      q: searchDebounced || undefined,
    })
    const cached = peekPageCache<ProductsCachePayload>(cacheKey)
    if (cached) {
      setProducts(cached.products)
      setTotalFiltered(cached.totalFiltered)
      setCounts(cached.counts)
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
      const data = await vendorProductsApi.list({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        q: searchDebounced || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      })
      const nextProducts = data?.products || []
      const nextTotal =
        typeof data?.count === "number" ? data.count : nextProducts.length
      const nextCounts = data?.counts
        ? {
            total: Number(data.counts.total) || 0,
            published: Number(data.counts.published) || 0,
            draft: Number(data.counts.draft) || 0,
            pending: Number(data.counts.pending) || 0,
          }
        : { total: 0, published: 0, draft: 0, pending: 0 }

      setProducts(nextProducts)
      setTotalFiltered(nextTotal)
      setCounts(nextCounts)
      writePageCache(cacheKey, {
        products: nextProducts,
        totalFiltered: nextTotal,
        counts: nextCounts,
      } satisfies ProductsCachePayload)
      setError(null)
    } catch (e: any) {
      if (e.status === 403) {
        router.push("/pending")
        return
      }
      setError(e?.message || "Failed to load products")
      console.error("Products error:", e)
    } finally {
      setLoading(false)
    }
  }, [router, page, searchDebounced, statusFilter])

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      router.push("/login")
      return
    }
    void loadProducts()
  }, [router, loadProducts])

  useVendorLive({
    onInvalidate: () => {
      void loadProducts()
    },
  })

  useEffect(() => {
    setPage(1)
  }, [statusFilter, searchDebounced])

  const stats = counts
  const pageCount = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE))

  const filterOptions = [
    { value: "all" as const, label: "All", count: stats.total },
    { value: "published" as const, label: "Published", count: stats.published },
    { value: "pending" as const, label: "Pending", count: stats.pending },
    { value: "draft" as const, label: "Draft", count: stats.draft },
  ]

  let content

  if (loading && products.length === 0) {
    content = (
      <PageSkeleton label="Loading products…" stats={4} rows={6} cols={4} showAction />
    )
  } else if (error && products.length === 0) {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      </Container>
    )
  } else {
    content = (
      <Container className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        <div
          className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4"
          style={{ animationDelay: "0ms" }}
        >
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              Products
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              {stats.total > 0
                ? `${stats.total} product${stats.total > 1 ? "s" : ""} in your catalog · ${stats.published} live`
                : "Manage your product catalog"}
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => router.push("/products/bulk-upload")}>
              Bulk Upload
            </Button>
            <Button variant="secondary" onClick={() => router.push("/products/new#migrate")}>
              Migrate from oweg.in
            </Button>
            <Button variant="secondary" className="oweg-btn-primary" onClick={() => router.push("/products/new")}>
              <Plus />
              Create Product
            </Button>
          </div>
        </div>

        {stats.total > 0 && (
          <div
            className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4 animate-fade-in-up-slow"
            style={{ animationDelay: "80ms" }}
          >
            <StatCard
              icon={<ArchiveBox />}
              label="Total Products"
              value={stats.total}
              subtext={<Text className="text-ui-fg-subtle">In your catalog</Text>}
            />
            <StatCard
              icon={<Tag />}
              label="Published"
              value={stats.published}
              subtext={
                <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                  <StatusDot variant="success" />
                  <Text size="small">Live on store</Text>
                </span>
              }
            />
            <StatCard
              icon={<Tag />}
              label="Pending"
              value={stats.pending}
              subtext={
                <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                  <StatusDot variant="warning" />
                  <Text size="small">Awaiting approval</Text>
                </span>
              }
            />
            <StatCard
              icon={<Tag />}
              label="Drafts"
              value={stats.draft}
              subtext={
                <span className="inline-flex items-center gap-1.5 text-ui-fg-subtle">
                  <StatusDot variant="neutral" />
                  <Text size="small">Not published</Text>
                </span>
              }
            />
          </div>
        )}

        {stats.total === 0 ? (
          <div className="animate-fade-in-up" style={{ animationDelay: "120ms" }}>
            <EmptyState
              accent="purple"
              icon={<Tag />}
              title="No products yet"
              description="Create your first product or bulk upload from Excel to start selling."
              primaryAction={{
                label: "Create product",
                onClick: () => router.push("/products/new"),
              }}
              secondaryAction={{
                label: "Bulk upload",
                onClick: () => router.push("/products/bulk-upload"),
              }}
            />
          </div>
        ) : (
          <>
            <div
              className="animate-fade-in-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              style={{ animationDelay: "120ms" }}
            >
              <div className="relative w-full sm:max-w-sm">
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-fg-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products…"
                  className="h-10 w-full rounded-lg border border-ui-border-base/70 bg-ui-bg-base pl-9 pr-3 text-sm text-ui-fg-base outline-none transition-colors placeholder:text-ui-fg-muted focus:border-ui-border-strong"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-all duration-200 ${
                      statusFilter === option.value
                        ? "border-ui-border-strong bg-ui-bg-subtle text-ui-fg-base"
                        : "border-ui-border-base/70 text-ui-fg-subtle hover:border-ui-border-strong hover:text-ui-fg-base"
                    }`}
                  >
                    {option.label}
                    <span className="ml-1.5 text-ui-fg-muted">({option.count})</span>
                  </button>
                ))}
              </div>
            </div>

            <div
              className="animate-fade-in-up overflow-hidden rounded-xl border border-ui-border-base/70 bg-ui-bg-base"
              style={{ animationDelay: "160ms" }}
            >
              {products.length === 0 ? (
                <div className="p-10 text-center">
                  <Text className="text-ui-fg-subtle">
                    No products match your search or filter.
                  </Text>
                  <Button
                    variant="transparent"
                    className="mt-3"
                    onClick={() => {
                      setSearch("")
                      setStatusFilter("all")
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                <>
                  <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_110px_140px_120px_80px] gap-4 border-b border-ui-border-base/70 bg-ui-bg-subtle/30 px-4 py-3">
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      Product
                    </Text>
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      GST
                    </Text>
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      Status
                    </Text>
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      Created
                    </Text>
                    <Text size="small" weight="plus" className="text-right text-ui-fg-subtle">
                      Actions
                    </Text>
                  </div>

                  <div className="divide-y divide-ui-border-base/70">
                    {products.map((product) => {
                      const status = resolveProductStatus(product)
                      const taxCode =
                        product.metadata?.tax_code ||
                        (product.metadata?.gst_rate != null
                          ? `GST_${product.metadata.gst_rate}`
                          : null)

                      return (
                        <div
                          key={product.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => router.push(`/products/${product.id}`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              router.push(`/products/${product.id}`)
                            }
                          }}
                          className="group grid grid-cols-1 gap-3 px-4 py-4 transition-all duration-200 hover:bg-ui-bg-subtle/70 md:grid-cols-[minmax(0,1fr)_110px_140px_120px_80px] md:items-center md:gap-4 cursor-pointer"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <ProductThumbnail product={product} />
                            <div className="min-w-0">
                              <Text weight="plus" className="truncate">
                                {product.title}
                              </Text>
                              {product.handle && (
                                <Text size="small" className="truncate text-ui-fg-subtle">
                                  {product.handle}
                                </Text>
                              )}
                            </div>
                          </div>

                          <div className="md:contents">
                            <div className="flex items-center gap-2 md:block">
                              <Text size="xsmall" className="text-ui-fg-muted md:hidden">
                                GST
                              </Text>
                              <Text size="small" className="text-ui-fg-base">
                                {taxCode || "—"}
                              </Text>
                            </div>

                            <div className="flex items-center gap-2 md:block">
                              <Text size="xsmall" className="text-ui-fg-muted md:hidden">
                                Status
                              </Text>
                              <ProductStatus status={status} />
                            </div>

                            <div className="flex items-center gap-2 md:block">
                              <Text size="xsmall" className="text-ui-fg-muted md:hidden">
                                Created
                              </Text>
                              <Text size="small" className="text-ui-fg-subtle">
                                {formatDate(product.created_at)}
                              </Text>
                            </div>

                            <div className="flex items-center justify-end">
                              <Button
                                variant="transparent"
                                size="small"
                                className="text-ui-fg-subtle group-hover:text-ui-fg-base"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/products/${product.id}`)
                                }}
                              >
                                Edit
                                <ArrowUpRightMini className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2 text-ui-fg-muted sm:flex-row sm:items-center sm:justify-between">
              <Text size="small">
                Showing {products.length ? (page - 1) * PAGE_SIZE + 1 : 0}-
                {Math.min(page * PAGE_SIZE, totalFiltered)} of {totalFiltered}
              </Text>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 disabled:opacity-40"
                >
                  <ChevronLeft />
                </button>
                <Text size="small">
                  Page {page} of {pageCount}
                </Text>
                <button
                  type="button"
                  disabled={page >= pageCount}
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ui-border-base/70 disabled:opacity-40"
                >
                  <ChevronRight />
                </button>
              </div>
            </div>
          </>
        )}
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorProductsPage
