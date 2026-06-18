"use client";

import React from "react";
import Link from "next/link";
import {
  openStorefrontLink,
} from "@/lib/open-storefront-link";

export const MEGA_MENU_BANNER_ASPECT = 793 / 1983;
export const MEGA_MENU_BANNER_ROTATE_MS = 3000;

export type MegaMenuBannerSlide = {
  id: string;
  image_url: string;
  link_url: string;
  alt_text?: string;
  open_in_new_tab?: boolean;
};

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

  React.useEffect(() => {
    setActiveIndex(0);
  }, [banners]);

  React.useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % banners.length);
    }, MEGA_MENU_BANNER_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [banners.length, paused]);

  if (!banners.length) return null;

  const activeBanner = banners[activeIndex] ?? banners[0];
  const bannerHref = activeBanner.link_url || "#";
  const opensNewTab = activeBanner.open_in_new_tab === true;
  const linkClassName =
    "block h-full max-w-full aspect-[793/1983] overflow-hidden rounded-lg border border-[#C8EAC0] bg-white";

  const bannerImage = (
    <img
      src={activeBanner.image_url}
      alt={activeBanner.alt_text || "Category promotion"}
      className="h-full w-full object-cover object-center"
    />
  );

  const handleNewTabClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onNavigate?.();
    openStorefrontLink(bannerHref, { newTab: true });
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${className}`.trim()}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex min-h-0 flex-1 justify-center w-full">
        {opensNewTab ? (
          <a
            href={bannerHref}
            target="_blank"
            rel="noopener noreferrer external"
            className={linkClassName}
            onClick={handleNewTabClick}
          >
            {bannerImage}
          </a>
        ) : (
          <Link href={bannerHref} className={linkClassName} onClick={onNavigate}>
            {bannerImage}
          </Link>
        )}
      </div>

      {banners.length > 1 ? (
        <div className="mt-2 flex shrink-0 items-center justify-center gap-1.5">
          {banners.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              aria-label={`Show banner ${index + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                index === activeIndex ? "w-4 bg-[#66C940]" : "w-1.5 bg-[#66C940]/35"
              }`}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
