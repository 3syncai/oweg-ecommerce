// CategoryHeader: Horizontal scrollable subcategory circles for category navigation

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MedusaCategory } from "@/services/medusa";

type CategoryHeaderProps = {
  categoryHandle: string;
  subcategories: MedusaCategory[];
};

export function CategoryHeader({
  categoryHandle,
  subcategories,
}: CategoryHeaderProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [previewImages, setPreviewImages] = useState<Record<string, string>>({});

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
  }, [updateScrollState]);

  useEffect(() => {
    const missingIds = subcategories
      .map((sub) => sub.id)
      .filter(
        (id): id is string =>
          typeof id === "string" && id.length > 0 && !previewImages[id]
      );

    if (missingIds.length === 0) {
      return;
    }

    let cancelled = false;

    async function loadPreviews(ids: string[]) {
      try {
        const params = new URLSearchParams({
          categoryIds: ids.join(","),
        });
        const res = await fetch(`/api/medusa/category-previews?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const normalized: Record<string, string> = {};
        const previews = data.previews || {};
        Object.entries(previews).forEach(([key, value]) => {
          if (value && typeof value === "object" && "image" in value) {
            const image = (value as { image?: string }).image;
            if (image) {
              normalized[key] = image;
            }
          }
        });

        if (Object.keys(normalized).length === 0) {
          return;
        }

        setPreviewImages((prev) => ({
          ...prev,
          ...normalized,
        }));
      } catch (error) {
        console.warn("Failed loading category preview images", error);
      }
    }

    loadPreviews(missingIds);

    return () => {
      cancelled = true;
    };
  }, [subcategories, previewImages]);

  if (subcategories.length === 0) {
    return null;
  }

  return (
    <div className="relative bg-white border border-gray-200 rounded-lg p-4 overflow-hidden">
      <button
        type="button"
        onClick={() => scroll("left")}
        aria-label="Scroll categories left"
        className={`absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white/90 p-2 text-gray-600 shadow transition-all duration-200 hover:text-[#7AC943] ${
          canScrollLeft ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={() => scroll("right")}
        aria-label="Scroll categories right"
        className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white/90 p-2 text-gray-600 shadow transition-all duration-200 hover:text-[#7AC943] ${
          canScrollRight ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      <div
        ref={scrollContainerRef}
        className="flex gap-6 overflow-x-auto scrollbar-hide scroll-smooth py-2 flex-1 min-w-0"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
          {subcategories.map((subcat) => {
            const subcatHandle = subcat.handle || subcat.id;
            const subcatTitle =
              subcat.title || subcat.name || "Subcategory";
            const subcatHref = `/c/${categoryHandle}/${subcatHandle}`;

            // Using placeholder green circle - in production you'd use subcat.metadata.image or similar
            const metadata = (subcat.metadata || {}) as Record<string, unknown>;
            const imageUrl =
              (metadata?.image as string) ||
              (metadata?.icon as string) ||
              (subcat.id ? previewImages[subcat.id] : undefined) ||
              "/oweg_logo.png";

            return (
              <Link
                key={subcat.id}
                href={subcatHref}
                className="flex flex-col items-center gap-2 flex-shrink-0 group"
              >
                {/* Circular Image */}
                <div className="relative w-20 h-20 rounded-full bg-[#7AC943] shadow-[inset_0_2px_6px_rgba(0,0,0,0.18)] ring-1 ring-[#66b735]/40 border border-[#7AC943] overflow-hidden transition-all duration-300 flex items-center justify-center group-hover:shadow-[inset_0_3px_8px_rgba(0,0,0,0.22)]">
                  <div
                    className="relative w-14 h-14 rounded-full overflow-hidden bg-transparent shadow-[inset_0_0_12px_rgba(0,0,0,0.15)]"
                    style={{
                      WebkitMaskImage:
                        "radial-gradient(circle at center, #000 72%, transparent 100%)",
                      maskImage:
                        "radial-gradient(circle at center, #000 72%, transparent 100%)",
                    }}
                  >
                    <Image
                      src={imageUrl}
                      alt={subcatTitle}
                      fill
                      className="object-contain w-full h-full mix-blend-multiply"
                    />
                  </div>
                </div>

                {/* Category Label */}
                <span className="text-xs font-medium text-gray-700 text-center max-w-[80px] line-clamp-2 group-hover:text-[#7AC943] transition-colors">
                  {subcatTitle}
                </span>
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

