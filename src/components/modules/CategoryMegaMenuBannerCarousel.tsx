"use client";

import React from "react";
import Link from "next/link";
import { openStorefrontLink } from "@/lib/open-storefront-link";
import {
  preloadMegaMenuBannerImages,
  type MegaMenuBannerSlide,
} from "@/lib/mega-menu-banner-cache";

/** Placeholder ratio used only by loading skeletons elsewhere. */
export const MEGA_MENU_BANNER_ASPECT = 793 / 1983;
export const MEGA_MENU_BANNER_ROTATE_MS = 3000;

export type { MegaMenuBannerSlide };

type CategoryMegaMenuBannerCarouselProps = {
  banners: MegaMenuBannerSlide[];
  onNavigate?: () => void;
  className?: string;
};

export default function CategoryMegaMenuBannerCarousel({
  banners,
  onNavigate,
  className = "",
}: CategoryMegaMenuBannerCarouselProps) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [aspectByUrl, setAspectByUrl] = React.useState<Record<string, number>>(
    {}
  );

  React.useEffect(() => {
    setActiveIndex(0);
    preloadMegaMenuBannerImages(banners);
  }, [banners]);

  React.useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % banners.length);
    }, MEGA_MENU_BANNER_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [banners.length, paused]);

  React.useEffect(() => {
    let cancelled = false;
    banners.forEach((banner) => {
      const img = new Image();
      img.onload = () => {
        if (cancelled || !img.naturalWidth || !img.naturalHeight) return;
        const ratio = img.naturalWidth / img.naturalHeight;
        setAspectByUrl((prev) => {
          if (prev[banner.image_url] === ratio) return prev;
          return { ...prev, [banner.image_url]: ratio };
        });
      };
      img.src = banner.image_url;
    });
    return () => {
      cancelled = true;
    };
  }, [banners]);

  if (!banners.length) return null;

  const activeBanner = banners[activeIndex];
  const knownActiveAspect =
    activeBanner && aspectByUrl[activeBanner.image_url]
      ? aspectByUrl[activeBanner.image_url]
      : null;

  const linkClassName =
    "block w-full overflow-hidden rounded-lg border border-[#C8EAC0] bg-white";

  const rememberAspect = (imageUrl: string, img: HTMLImageElement) => {
    const { naturalWidth, naturalHeight } = img;
    if (!naturalWidth || !naturalHeight) return;
    const ratio = naturalWidth / naturalHeight;
    setAspectByUrl((prev) => {
      if (prev[imageUrl] === ratio) return prev;
      return { ...prev, [imageUrl]: ratio };
    });
  };

  const handleNewTabClick =
    (bannerHref: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      onNavigate?.();
      openStorefrontLink(bannerHref, { newTab: true });
    };

  return (
    <div
      className={`flex w-full flex-col ${className}`.trim()}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="relative w-full max-w-full"
        style={
          knownActiveAspect
            ? { aspectRatio: String(knownActiveAspect) }
            : undefined
        }
      >
        {banners.map((banner, index) => {
          const isActive = index === activeIndex;
          const bannerHref = banner.link_url || "#";
          const opensNewTab = banner.open_in_new_tab === true;
          const image = (
            <img
              src={banner.image_url}
              alt={banner.alt_text || "Category promotion"}
              className={
                isActive
                  ? "block h-auto w-full"
                  : "h-full w-full object-cover object-center"
              }
              loading={isActive ? "eager" : "lazy"}
              decoding="async"
              onLoad={(event) =>
                rememberAspect(banner.image_url, event.currentTarget)
              }
            />
          );

          return (
            <div
              key={banner.id}
              className={
                isActive
                  ? "relative z-10 w-full"
                  : "pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300"
              }
              aria-hidden={!isActive}
            >
              {opensNewTab ? (
                <a
                  href={bannerHref}
                  target="_blank"
                  rel="noopener noreferrer external"
                  className={isActive ? linkClassName : `${linkClassName} h-full`}
                  onClick={handleNewTabClick(bannerHref)}
                  tabIndex={isActive ? 0 : -1}
                >
                  {image}
                </a>
              ) : (
                <Link
                  href={bannerHref}
                  className={isActive ? linkClassName : `${linkClassName} h-full`}
                  onClick={onNavigate}
                  tabIndex={isActive ? 0 : -1}
                >
                  {image}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {banners.length > 1 ? (
        <div className="mt-2 flex shrink-0 items-center justify-center gap-1.5">
          {banners.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              aria-label={`Show banner ${index + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                index === activeIndex
                  ? "w-4 bg-[#66C940]"
                  : "w-1.5 bg-[#66C940]/35"
              }`}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}


