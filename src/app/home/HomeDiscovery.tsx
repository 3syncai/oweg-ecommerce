"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { ProductCard } from "@/components/modules/ProductCard"
import type { HomeDiscoveryPage } from "@/lib/home-discovery"
import type { HomeProduct } from "@/lib/home-products"
import styles from "./HomePage.module.css"

export default function HomeDiscovery({ excludeIds }: { excludeIds: string[] }) {
  const anchor = useRef<HTMLElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const [nearby, setNearby] = useState(false)
  const [manualLoading, setManualLoading] = useState(false)
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
    getNextPageParam: page => page.nextOffset ?? undefined,
  })
  const { hasNextPage, isFetching, isError, fetchNextPage } = query
  const pageCount = query.data?.pages.length || 0
  useEffect(() => {
    if (!nearby || !sentinel.current || !hasNextPage || isFetching || isError || manualLoading) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void fetchNextPage({ cancelRefetch: false })
    }, { rootMargin: "400px" })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [nearby, hasNextPage, isFetching, isError, fetchNextPage, pageCount, manualLoading])
  const products = useMemo(() => {
    const seen = new Set(excludeIds)
    return (query.data?.pages.flatMap(page => page.products) || []).filter((product: HomeProduct) => {
      const key = product.catalog_product_id || String(product.id)
      if (seen.has(key) || !(Number(product.inventory_quantity) > 0)) return false
      seen.add(key)
      return true
    })
  }, [excludeIds, query.data])
  if (query.data && !products.length && !query.hasNextPage && !query.isError) return null
  return <section ref={anchor} className="oweg-section-tight" aria-label="More products to explore">
    <div className="oweg-container">
      <div className="oweg-section-head">
        <div><p className={styles.eyebrow}>Keep discovering</p><h2 className="oweg-title">More to explore</h2>
          <p className="oweg-subtle mt-2">More finds for your home, your routine and you.</p></div>
      </div>
      <div className={styles.discoveryGrid} aria-busy={query.isFetching}>
        {products.map(product => <ProductCard key={product.catalog_product_id || product.id} {...product} sourceTag="home:discover" showImageFallback prefetch={false} />)}
        {(!nearby || query.isPending) && Array.from({ length: 6 }, (_, index) => <div key={index} className={styles.discoverySkeleton} aria-hidden="true" />)}
      </div>
      <div ref={sentinel} className={styles.discoveryActions}>
        {query.isError && <p role="alert" className="text-sm text-red-700">More products couldn’t load. Your other products are still available.</p>}
        {query.isFetching && <span role="status"><Loader2 size={22} className="animate-spin text-[#659447]" aria-hidden="true" /><span className="sr-only">Loading more products</span></span>}
        {(query.isError || (manualLoading && query.hasNextPage)) && <button type="button" className={styles.secondaryLink}
          disabled={query.isFetching} onClick={() => {
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
