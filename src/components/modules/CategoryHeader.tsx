// CategoryHeader: Horizontal subcategory navigation using the shared SVG icon set.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CategoryIconTile from "@/components/ui/icons/CategoryIconTile";
import type { MedusaCategory } from "@/services/medusa";

type CategoryHeaderProps = {
  categoryHandle: string;
  subcategories: MedusaCategory[];
  initialPreviews?: Record<string, string | { image: string; productId?: string }>;
};

export function CategoryHeader({
  categoryHandle,
  subcategories,
}: CategoryHeaderProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    const { scrollLeft, scrollWidth, clientWidth } = node;
    setCanScrollLeft(scrollLeft > 12);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 12);
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300;
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    updateScrollState();
    const node = scrollContainerRef.current;
    if (!node) return;
    node.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      node.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState, subcategories.length]);

  if (subcategories.length === 0) {
    return null;
  }

  return (
    <div className="relative bg-white border border-[#e1e8d7] rounded-2xl p-4 overflow-hidden" role="region" aria-label="Browse subcategories">
      <button
        type="button"
        onClick={() => scroll("left")}
        aria-label="Scroll categories left"
        tabIndex={canScrollLeft ? 0 : -1}
        className={`absolute z-10 left-3 top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white/95 p-2 text-gray-600 shadow transition-all duration-200 hover:text-[#659c3d] ${
          canScrollLeft ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={() => scroll("right")}
        aria-label="Scroll categories right"
        tabIndex={canScrollRight ? 0 : -1}
        className={`absolute z-10 right-3 top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white/95 p-2 text-gray-600 shadow transition-all duration-200 hover:text-[#659c3d] ${
          canScrollRight ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      <div
        ref={scrollContainerRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide scroll-smooth py-2 flex-1 min-w-0"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
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
                className="flex w-24 sm:w-28 flex-col items-center flex-shrink-0 group rounded-xl py-1 outline-none focus-visible:ring-2 focus-visible:ring-[#7AC943]"
                title={subcatTitle}
              >
                <CategoryIconTile
                  kind="subcategory"
                  handle={subcat.handle}
                  title={subcatTitle}
                  size="lg"
                  labelClassName="min-h-[2.75em] max-w-[104px]"
                />
              </Link>
            );
          })}
      </div>

      {/* Hide scrollbar globally for this component */}
      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}

