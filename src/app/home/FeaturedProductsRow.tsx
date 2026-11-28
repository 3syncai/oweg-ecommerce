"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import { ProductCard } from "@/components/modules/ProductCard";
import type { HomeProduct } from "@/lib/home-products";
import styles from "./FeaturedProductsRow.module.css";

export default function FeaturedProductsRow({ title, products, nextCursor }: {
  title: string;
  products: HomeProduct[];
  nextCursor: string | null;
}) {
  const [extraProducts, setExtraProducts] = useState<HomeProduct[]>([]);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"retry" | "changed" | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cards = [...products, ...extraProducts];
  const headingId = useId();
  const trackId = useId();
  const trackRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ previous: false, next: false });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    function syncEdges() {
      if (!track) return;
      const previous = track.scrollLeft > 2;
      const next = track.scrollWidth - track.clientWidth - track.scrollLeft > 2;
      setEdges(current => current.previous === previous && current.next === next ? current : { previous, next });
    }

    syncEdges();
    const observer = new ResizeObserver(syncEdges);
    observer.observe(track);
    track.addEventListener("scroll", syncEdges, { passive: true });
    return () => {
      observer.disconnect();
      track.removeEventListener("scroll", syncEdges);
    };
  }, [cards.length]);

  function move(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track || track.children.length < 2) return;
    const [first, second] = track.children;
    const step = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
    if (step <= 0) return;
    const cardsPerPage = Math.max(1, Math.floor(track.clientWidth / step));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: direction * step * cardsPerPage, behavior: reduceMotion ? "instant" : "smooth" });
  }

  useEffect(() => {
    const trigger = triggerRef.current;
    const pageCursor = cursor;
    if (!pageCursor || error || !trigger) return;
    const controller = new AbortController();
    let requested = false;

    async function loadNext(pageCursor: string) {
      setLoading(true);
      try {
        const response = await fetch(`/api/featured-products?cursor=${encodeURIComponent(pageCursor)}`, {
          signal: controller.signal,
        });
        if (response.status === 409) {
          setError("changed");
          return;
        }
        if (!response.ok) throw new Error("Request failed");
        const page: { products: HomeProduct[]; nextCursor: string | null } = await response.json();
        if (controller.signal.aborted) return;
        setExtraProducts(current => {
          const seen = new Set([...products, ...current].map(product => product.catalog_product_id || String(product.id)));
          return [...current, ...page.products.filter(product => {
            const key = product.catalog_product_id || String(product.id);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })];
        });
        setCursor(page.nextCursor);
      } catch {
        if (!controller.signal.aborted) setError("retry");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    // The viewport observer also accounts for clipping by the horizontal rail.
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || requested) return;
      requested = true;
      observer.disconnect();
      void loadNext(pageCursor);
    });
    observer.observe(trigger);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [cursor, error, products]);

  return (
    <section className="oweg-section-tight" aria-labelledby={headingId}>
      <div className="oweg-container">
        <div className={styles.showcase}>
          <div className={styles.promotion}>
            <div className={styles.headline}>
              <ShoppingBag size={25} aria-hidden="true" />
              <h2 id={headingId} className={styles.title}>{title}</h2>
            </div>
            {(edges.previous || edges.next) && (
              <div className={styles.controls}>
                <button type="button" aria-controls={trackId} aria-label="Previous featured products"
                  disabled={!edges.previous} onClick={() => move(-1)}>
                  <ChevronLeft size={19} aria-hidden="true" />
                </button>
                <button type="button" aria-controls={trackId} aria-label="Next featured products"
                  disabled={!edges.next} onClick={() => move(1)}>
                  <ChevronRight size={19} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          <ul id={trackId} ref={trackRef} className={styles.track} aria-labelledby={headingId} tabIndex={0} aria-busy={loading}>
            {cards.map((product, index) => (
              <li key={product.id} className={styles.item}>
                <ProductCard
                  id={product.id}
                  name={product.name}
                  image={product.image}
                  price={product.price}
                  mrp={product.mrp}
                  discount={product.discount}
                  variant_id={product.variant_id}
                  variant_count={product.variant_count}
                  handle={product.handle}
                  sourceTag="featured-products"
                  inventory_quantity={product.inventory_quantity}
                  showImageFallback
                  prefetch={false}
                />
                {cursor && index === cards.length - 1 &&
                  <span key={cursor} ref={triggerRef} className={styles.trigger} aria-hidden="true" />}
              </li>
            ))}
            {!cards.length && cursor && (
              <li className={styles.placeholder} aria-hidden="true">
                <span key={cursor} ref={triggerRef} className={styles.trigger} />
              </li>
            )}
            {(loading || error) && (
              <li className={styles.status}>
                {loading && <span role="status">Loading products…</span>}
                {error === "retry" && (
                  <button type="button" onClick={() => setError(null)}>Retry loading products</button>
                )}
                {error === "changed" && (
                  <button type="button" onClick={() => window.location.reload()}>Refresh featured products</button>
                )}
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
