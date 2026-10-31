"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { ProductCard } from "@/components/modules/ProductCard"
import type { HomeDiscoveryPage } from "@/lib/home-discovery"
import type { HomeProduct } from "@/lib/home-products"
import styles from "./HomePage.module.css"
import { discoveryRows, nextDiscoveryOffset } from "@/lib/home-discovery-rows"

export default function HomeDiscovery({ excludeIds }: { excludeIds: string[] }) {
  const anchor = useRef<HTMLElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(2)
  const [autoPaused, setAutoPaused] = useState(false)
  const fillBudget = useRef({ visibleCount: 0, attempts: 0 })
  const [nearby, setNearby] = useState(false)
  const [manualLoading, setManualLoading] = useState(false)
  useEffect(() => {
    const node = grid.current
    if (!node) return
    const measure = () => {
      const count = getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length
      setColumns(Math.max(1, count))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!anchor.current) return
    if (!("IntersectionObserver" in window)) { setNearby(true); setManualLoading(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setNearby(true); observer.disconnect() }
    }, { rootMargin: "500px" })
    observer.observe(anchor.current)
    return () => observer.disconnect()
  }, [])
  const query = useInfiniteQuery({
    queryKey: ["home-discovery"],
    initialPageParam: 0,
    enabled: nearby,
    staleTime: 60_000,
    queryFn: async ({ pageParam, signal }): Promise<HomeDiscoveryPage> => {
      const response = await fetch(`/api/home/discovery?offset=${pageParam}`, { signal })
      if (!response.ok) throw new Error("More products couldn’t load. Please try again.")
      return response.json()
    },
    getNextPageParam: (page, _pages, currentOffset) => nextDiscoveryOffset(page.nextOffset, currentOffset),
  })
  const { hasNextPage, isFetching, isError, fetchNextPage } = query
  const pageCount = query.data?.pages.length || 0
  const products = useMemo(() => {
    const seen = new Set(excludeIds)
    return (query.data?.pages.flatMap(page => page.products) || []).filter((product: HomeProduct) => {
      const key = product.catalog_product_id || String(product.id)
      if (seen.has(key) || !(Number(product.inventory_quantity) > 0)) return false
      seen.add(key)
      return true
    })
  }, [excludeIds, query.data])
  const rows = discoveryRows(products.length, columns, Boolean(hasNextPage))
  useEffect(() => {
    if (rows.visibleCount > fillBudget.current.visibleCount) {
      fillBudget.current = { visibleCount: rows.visibleCount, attempts: 0 }
    }
    if (!nearby || !rows.needsFill || isFetching || isError || manualLoading || autoPaused) return
    // Bound automatic scans when several pages contain only excluded products.
    if (fillBudget.current.attempts >= 4) { setAutoPaused(true); return }
    fillBudget.current.attempts++
    void fetchNextPage({ cancelRefetch: false })
  }, [nearby, rows.visibleCount, rows.needsFill, isFetching, isError, manualLoading, autoPaused, fetchNextPage, pageCount])
  useEffect(() => {
    if (!nearby || !sentinel.current || !hasNextPage || isFetching || isError || manualLoading || autoPaused || rows.needsFill) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void fetchNextPage({ cancelRefetch: false })
    }, { rootMargin: "400px" })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [nearby, hasNextPage, isFetching, isError, fetchNextPage, pageCount, manualLoading, autoPaused, rows.needsFill])
  const showingSkeletons = !nearby || query.isPending || query.isFetchingNextPage || (rows.needsFill && !isError && !autoPaused && !manualLoading)
  const skeletonCount = !query.data ? columns * 2 : columns
  if (query.data && !products.length && !query.hasNextPage && !query.isError) return null
  return <section ref={anchor} className="oweg-section-tight" aria-label="More products to explore">
    <div className="oweg-container">
      <div className="oweg-section-head">
        <div><p className={styles.eyebrow}>Keep discovering</p><h2 className="oweg-title">More to explore</h2>
          <p className="oweg-subtle mt-2">More finds for your home, your routine and you.</p></div>
      </div>
      <div ref={grid} className={styles.discoveryGrid} aria-busy={showingSkeletons}>
        {products.slice(0, rows.visibleCount).map(product => <ProductCard key={product.catalog_product_id || product.id} {...product} sourceTag="home:discover" showImageFallback prefetch={false} />)}
        {showingSkeletons && Array.from({ length: skeletonCount }, (_, index) => <div key={`skeleton-${index}`} className={styles.discoverySkeleton} aria-hidden="true">
          <div className={styles.skeletonImage} /><div className={styles.skeletonBody}><span /><span /><span /><span /></div>
        </div>)}
      </div>
      <div ref={sentinel} className={styles.discoveryActions}>
        {query.isError && <p role="alert" className="text-sm text-red-700">More products couldn’t load. Your other products are still available.</p>}
        {showingSkeletons && <span role="status" className="sr-only">Loading more products</span>}
        {(query.isError || ((manualLoading || autoPaused) && query.hasNextPage)) && <button type="button" className={styles.secondaryLink}
          disabled={query.isFetching} onClick={() => {
            fillBudget.current.attempts = 0
            setAutoPaused(false)
            if (!nearby) setNearby(true)
            else if (query.isError && !query.data) void query.refetch()
            else void query.fetchNextPage()
          }}>
          {query.isFetching && <Loader2 size={16} className="animate-spin" />}
          {query.isError ? "Try again" : "Load more products"}
        </button>}
      </div>
    </div>
  </section>
}
