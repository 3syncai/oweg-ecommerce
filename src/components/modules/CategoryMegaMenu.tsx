"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SubcategoryIcon from "@/components/ui/icons/SubcategoryIcon";
import { normalizeCategorySlug } from "@/components/ui/icons/CategoryIcon";
import CategoryMegaMenuBannerCarousel, {
  type MegaMenuBannerSlide,
} from "@/components/modules/CategoryMegaMenuBannerCarousel";
import { getCategoryMegaMenuConfig } from "@/lib/category-mega-menu.config";

export type MegaMenuCategory = {
  id: string;
  title: string;
  handle?: string;
  children: MegaMenuCategory[];
};

const itemClassName =
  "group flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm text-[#1F2A33] transition-all duration-200 hover:bg-[#EAF8E7] hover:text-[#66C940]";

const chipClassName =
  "group flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-xs font-medium text-[#1F2A33] transition-all duration-200 hover:bg-[#EAF8E7] hover:text-[#66C940] whitespace-nowrap";

export function getSubcategoryHref(parentHandle?: string, subHandle?: string) {
  if (!parentHandle || !subHandle) return "#";
  return `/c/${encodeURIComponent(parentHandle)}/${encodeURIComponent(subHandle)}`;
}

export function getCategoryHref(handle?: string) {
  return handle ? `/c/${encodeURIComponent(handle)}` : "#";
}

function childMatchesSlug(child: MegaMenuCategory, targetSlug: string) {
  const handleSlug = normalizeCategorySlug(child.handle);
  const titleSlug = normalizeCategorySlug(child.title);
  return handleSlug === targetSlug || titleSlug === targetSlug;
}

function resolvePopularItems(category: MegaMenuCategory) {
  const config = getCategoryMegaMenuConfig(category.handle);
  if (!config?.popularSlugs.length) return [];

  const matched: MegaMenuCategory[] = [];
  for (const slug of config.popularSlugs) {
    const child = category.children.find((c) => childMatchesSlug(c, slug));
    if (child && !matched.some((m) => m.id === child.id)) {
      matched.push(child);
    }
  }
  return matched;
}

type CategoryMegaMenuProps = {
  category: MegaMenuCategory;
  onClose: () => void;
};

export default function CategoryMegaMenu({ category, onClose }: CategoryMegaMenuProps) {
  const config = getCategoryMegaMenuConfig(category.handle);
  const popularItems = resolvePopularItems(category);
  const parentHandle = category.handle || "";
  const [banners, setBanners] = React.useState<MegaMenuBannerSlide[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    const handle = category.handle?.trim();
    if (!handle) {
      setBanners([]);
      return;
    }

    const loadBanners = async () => {
      try {
        const res = await fetch(
          `/api/medusa/mega-menu-banners?handle=${encodeURIComponent(handle)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setBanners(Array.isArray(data.banners) ? data.banners : []);
      } catch {
        if (!cancelled) setBanners([]);
      }
    };

    void loadBanners();
    return () => {
      cancelled = true;
    };
  }, [category.handle]);

  const showFeaturedPanel = Boolean(config?.featured || banners.length > 0);

  const handleMenuWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const delta = event.deltaY;
    const atTop = scrollTop <= 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight;
    if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <h3 className="shrink-0 px-2 pb-3 text-base font-semibold text-[#1F2A33]">{category.title}</h3>

        {popularItems.length > 0 ? (
          <div className="mb-4 shrink-0 px-1">
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Popular
            </p>
            <div className="flex flex-wrap gap-2">
              {popularItems.map((sub) => (
                <Link
                  key={sub.id}
                  href={getSubcategoryHref(parentHandle, sub.handle)}
                  className={chipClassName}
                  onClick={onClose}
                >
                  <SubcategoryIcon handle={sub.handle} title={sub.title} className="w-6 h-6" />
                  <span className="truncate max-w-[120px]">{sub.title}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mb-2 shrink-0 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          All Subcategories
        </p>

        <div
          className="grid min-h-0 flex-1 grid-cols-1 gap-1 overflow-y-auto pr-1 scrollbar-hide sm:grid-cols-2"
          onWheel={handleMenuWheel}
        >
          {category.children.map((sub) => (
            <Link
              key={sub.id}
              href={getSubcategoryHref(parentHandle, sub.handle)}
              className={itemClassName}
              onClick={onClose}
            >
              <SubcategoryIcon handle={sub.handle} title={sub.title} className="w-6 h-6" />
              <span className="min-w-0 flex-1 truncate leading-snug">{sub.title}</span>
            </Link>
          ))}
        </div>

        <div className="mt-4 shrink-0 border-t border-gray-100 pt-3 px-2">
          <Link
            href={getCategoryHref(category.handle)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#66C940] transition-colors hover:text-[#57b536]"
            onClick={onClose}
          >
            View all {category.title}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {showFeaturedPanel ? (
        <aside className="hidden w-[180px] shrink-0 self-stretch sm:block">
          <div className="flex h-full min-h-0 flex-col rounded-xl bg-[#EAF8E7] p-4">
            {config?.featured ? (
              <div className="shrink-0">
                <p className="text-lg font-bold leading-tight text-[#1F2A33]">
                  {config.featured.headline}
                </p>
                <p className="mt-2 text-sm leading-snug text-[#1F2A33]/80">
                  {config.featured.subtitle}
                </p>
              </div>
            ) : null}

            {banners.length > 0 ? (
              <div
                className={`min-h-0 flex-1 ${config?.featured ? "mt-3" : "mt-0"}`}
              >
                <CategoryMegaMenuBannerCarousel
                  banners={banners}
                  onNavigate={onClose}
                  className="h-full min-h-0"
                />
              </div>
            ) : null}

            {config?.featured ? (
              <Link
                href={config.featured.ctaHref}
                className="mt-3 inline-flex shrink-0 items-center justify-center rounded-lg bg-[#66C940] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#57b536]"
                onClick={onClose}
              >
                {config.featured.ctaLabel}
              </Link>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
