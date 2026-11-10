"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CategoryIconTile from "@/components/ui/icons/CategoryIconTile";
import { mobileCategoryArtwork } from "@/lib/mobile-category-artwork";
import type { MedusaCategory } from "@/services/medusa";
import styles from "./CategoryHeader.module.css";

type CategoryHeaderProps = {
  categoryHandle: string;
  subcategories: MedusaCategory[];
};

export function CategoryHeader({
  categoryHandle,
  subcategories,
}: CategoryHeaderProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const railId = useId();
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    const updateScrollState = () => {
      const { scrollLeft, scrollWidth, clientWidth } = node;
      setCanScrollBack(scrollLeft > 2);
      setCanScrollForward(scrollLeft + clientWidth < scrollWidth - 2);
    };

    updateScrollState();
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(node);
    node.addEventListener("scroll", updateScrollState, { passive: true });
    return () => {
      node.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [subcategories.length]);

  const scroll = (direction: -1 | 1) => {
    const rail = scrollContainerRef.current;
    const firstTile = rail?.firstElementChild;
    if (!rail || !firstTile) return;
    const gap = parseFloat(getComputedStyle(rail).columnGap);
    const stride = firstTile.getBoundingClientRect().width + gap;
    const visibleTiles = Math.max(1, Math.floor((rail.clientWidth + gap) / stride));
    rail.scrollBy({ left: direction * visibleTiles * stride });
  };

  if (!subcategories.length) return null;

  return (
    <section className={styles.explore} aria-labelledby={headingId}>
      <div className={styles.heading}>
        <div>
          <h2 id={headingId}>Explore categories</h2>
          <p>{subcategories.length} {subcategories.length === 1 ? "subcategory" : "subcategories"}</p>
        </div>
        <div className={styles.controls} hidden={!canScrollBack && !canScrollForward}>
          <button
            type="button"
            aria-label="Scroll categories left"
            aria-controls={railId}
            aria-disabled={!canScrollBack}
            onClick={() => { if (canScrollBack) scroll(-1); }}
          >
            <ChevronLeft size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Scroll categories right"
            aria-controls={railId}
            aria-disabled={!canScrollForward}
            onClick={() => { if (canScrollForward) scroll(1); }}
          >
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        id={railId}
        ref={scrollContainerRef}
        className={styles.rail}
      >
          {subcategories.map((subcat) => {
            const subcatHandle = subcat.handle || subcat.id;
            const subcatTitle =
              subcat.title || subcat.name || "Subcategory";
            const subcatHref = `/c/${categoryHandle}/${subcatHandle}`;

            return (
              <Link
                key={subcat.id}
                href={subcatHref}
                className={`group ${styles.tile}`}
              >
                <CategoryIconTile
                  kind="subcategory"
                  handle={subcat.handle}
                  title={subcatTitle}
                  size="xl"
                  artworkSrc={mobileCategoryArtwork("subcategory", subcat.handle, subcatTitle)}
                  labelClassName={styles.label}
                />
              </Link>
            );
          })}
      </div>

    </section>
  );
}

