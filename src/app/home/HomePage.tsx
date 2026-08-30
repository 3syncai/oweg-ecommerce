'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, MapPin, UserRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ProductCard } from '@/components/modules/ProductCard';
import type { MedusaCategory } from '@/lib/medusa';
import { useAuth } from '@/contexts/AuthProvider';
import { useStoreCategories } from '@/hooks/useStoreCategories';
import { normalizeBrandKey, resolveBrandLogo, getCollectionLogoUrl, getCollectionLogoScale } from '@/lib/brand-logos';
import { BrandLogoImage, brandLogoFallbackHandler } from '@/components/modules/BrandLogoImage';
import FlashSaleSection from '@/components/flash-sale/FlashSaleSection';
import CategoryIconTile from '@/components/ui/icons/CategoryIconTile';

// UI product type (used by carousel/cards)
type UIProduct = {
  id: string | number;
  name: string;
  image: string;
  price: number;
  mrp: number;
  discount: number;
  limitedDeal?: boolean;
  variant_id?: string;
  handle?: string;
  sourceTag?: string;
  inventory_quantity?: number;
};

// Product Carousel Component
function ProductCarousel({
  title,
  products,
  sourceTag,
  loading,
}: {
  title: string;
  products: UIProduct[];
  sourceTag?: string;
  loading?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    const node = scrollRef.current;
    if (!node) return;
    // Page by ~80% of the visible track so cards never land half-cut.
    const scrollAmount = Math.max(200, Math.round(node.clientWidth * 0.8));
    node.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const skeletonCards = Array.from({ length: 8 }).map((_, idx) => (
    <div
      key={`loader-${idx}`}
      className="oweg-rail-item oweg-surface-card overflow-hidden animate-pulse"
    >
      <div className="aspect-square bg-[var(--oweg-surface-subtle)]" />
      <div className="p-3 sm:p-4 space-y-2.5">
        <div className="h-3.5 w-2/3 bg-gray-200 rounded" />
        <div className="h-3 w-1/2 bg-gray-200 rounded" />
        <div className="h-4 w-full bg-gray-200 rounded" />
      </div>
    </div>
  ));

  return (
    <section className="oweg-section-tight">
      <div className="oweg-container">
        <div className="oweg-section-head">
          <h2 className="oweg-title">{title}</h2>
          <div className="hidden sm:flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scroll('left')}
              className="oweg-rail-btn"
              aria-label={`Scroll ${title} left`}
            >
              <ChevronLeft className="w-4.5 h-4.5" />
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              className="oweg-rail-btn"
              aria-label={`Scroll ${title} right`}
            >
              <ChevronRight className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="oweg-rail oweg-rail-bleed scrollbar-hidden"
          role="region"
          aria-label={`${title} product carousel`}
        >
          {loading
            ? skeletonCards
            : [...products]
                .sort((a, b) => {
                  // Sort in-stock products first, out-of-stock last
                  const aInStock = typeof a.inventory_quantity === 'number' && a.inventory_quantity > 0;
                  const bInStock = typeof b.inventory_quantity === 'number' && b.inventory_quantity > 0;
                  if (aInStock && !bInStock) return -1;
                  if (!aInStock && bInStock) return 1;
                  return 0;
                })
                .map((product) => (
                  <div key={product.id} className="oweg-rail-item">
                    <ProductCard
                      id={product.id}
                      name={product.name}
                      image={product.image}
                      price={product.price}
                      mrp={product.mrp}
                      discount={product.discount}
                      limitedDeal={product.limitedDeal}
                      variant_id={product.variant_id}
                      handle={product.handle}
                      sourceTag={sourceTag}
                      inventory_quantity={product.inventory_quantity}
                    />
                  </div>
                ))}
        </div>
      </div>
    </section>
  );
}

// Hero Banner Component
const HERO_SLIDES = [
  { src: '/HeroBaneer_1.png', href: '/specials', label: 'See Specials offers' },
  { src: '/HeroBaneer_2.png', href: '/c/home-appliances', label: 'Shop Home Appliances' },
  { src: '/HeroBaneer_3.png', href: '/c/kitchen-appliances', label: 'Shop Kitchen Appliances' },
  { src: '/HeroBaneer_4.png', href: '/c/computer-and-mobile-accessories', label: 'Shop Computer & Mobile Accessories' },
  { src: '/HeroBaneer_5.png', href: '/c/mobile-accessories', label: 'Shop Mobile Accessories' },
  { src: '/HeroBaneer_6.png', href: '/c/surveillance-and-security', label: 'Shop Surveillance & Security' },
  { src: '/HeroBaneer_7.png', href: '/c/clothing', label: 'Shop Clothing' },
  { src: '/HeroBaneer_8.png', href: '/c/bags', label: 'Shop Bags' },
  { src: '/HeroBaneer_9.png', href: '/c/hardware', label: 'Shop Hardware' },
  { src: '/HeroBaneer_10.png', href: '/c/toys-and-games', label: 'Shop Toys and Games' },
  { src: '/HeroBaneer_11.png', href: '/c/health-care', label: 'Shop Health Care' },
  { src: '/HeroBaneer_12.png', href: '/c/stationery', label: 'Shop Stationery' },
  { src: '/Banner.png', href: '/c/beauty-and-personal-care', label: 'Shop Beauty and Personal Care' },
  { src: '/HeroBaneer_13.png', href: '/c/jewellery', label: 'Shop Jewellery' },
];

const BAG_SECTION_BANNERS = [
  { image: '/Mixer_banner.png', href: '/c/mixer-grinders', alt: 'Shop mixer grinders' },
];

// Portrait-friendly artwork used for the hero on small screens (source ratio ~2:1),
// so the wide 3.28:1 desktop slides never get their left-aligned copy cropped.
const MOBILE_HERO_SLIDES = [
  { src: '/App_Banner-1.jpg', href: '/specials', label: 'Explore Specials' },
  { src: '/App_Banner-3.jpg', href: '/c/kitchen-appliances', label: 'Shop Kitchen Appliances' },
  { src: '/App_Banner-9.png', href: '/c/home-appliances', label: 'Shop Home Appliances' },
];

/**
 * Full-width banner that keeps the artwork's own aspect ratio, so images are
 * never stretched or letterboxed at any breakpoint.
 */
function BannerTile({
  src,
  href,
  alt,
  priority = false,
  ratio = '3.28',
  sizes = '100vw',
  className = '',
}: {
  src: string;
  href: string;
  alt: string;
  priority?: boolean;
  ratio?: string;
  sizes?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={alt}
      className={`oweg-media group block w-full ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.035]"
        sizes={sizes}
        priority={priority}
      />
    </Link>
  );
}

function HeroDot({
  active,
  index,
  onSelect,
}: {
  active: boolean;
  index: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Go to slide ${index + 1}`}
      aria-current={active ? 'true' : undefined}
      className="group/dot flex h-11 items-center justify-center px-1.5"
    >
      <span
        className={`h-1.5 rounded-full transition-all duration-300 ${
          active
            ? 'w-7 bg-[var(--oweg-green)]'
            : 'w-1.5 bg-[var(--oweg-border-strong)] group-hover/dot:bg-[var(--oweg-green-light)]'
        }`}
      />
    </button>
  );
}

function HeroBanner() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [heroReady, setHeroReady] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDelta, setTouchDelta] = useState(0);

  useEffect(() => {
    if (isHovered || touchStart !== null) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [isHovered, touchStart]);

  const prev = () =>
    setCurrentSlide((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  const next = () =>
    setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setTouchStart(e.touches[0].clientX);
    setTouchDelta(0);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStart === null) return;
    setTouchDelta(e.touches[0].clientX - touchStart);
  };

  const handleTouchEnd = () => {
    if (touchStart === null) return;
    if (Math.abs(touchDelta) > 60) {
      if (touchDelta > 0) {
        prev();
      } else {
        next();
      }
    }
    setTouchStart(null);
    setTouchDelta(0);
  };

  const mobileSlide = MOBILE_HERO_SLIDES[currentSlide % MOBILE_HERO_SLIDES.length];

  return (
    <section
      className="relative w-full overflow-hidden bg-[var(--oweg-surface-subtle)]"
      aria-roledescription="carousel"
      aria-label="Featured offers"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Mobile: portrait-friendly artwork at its own ratio */}
      <div className="relative w-full md:hidden" style={{ aspectRatio: '2.05' }}>
        {!heroReady && (
          <div className="absolute inset-0 z-10 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-pulse" />
        )}
        <Link href={mobileSlide.href} aria-label={mobileSlide.label} className="absolute inset-0 block">
          <Image
            key={mobileSlide.src}
            src={mobileSlide.src}
            alt={mobileSlide.label}
            fill
            priority
            onLoad={() => setHeroReady(true)}
            className="object-cover object-center oweg-fade-up"
            sizes="100vw"
          />
        </Link>
      </div>

      {/* Desktop: wide slides at their native 3.28:1 ratio — no crop, no stretch */}
      <div className="relative hidden w-full md:block" style={{ aspectRatio: '3.28' }}>
        {!heroReady && (
          <div className="absolute inset-0 z-10 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-pulse" />
        )}
        {HERO_SLIDES.map((slide, idx) => {
          const dist = Math.min(
            Math.abs(idx - currentSlide),
            HERO_SLIDES.length - Math.abs(idx - currentSlide)
          );
          if (dist > 1) return null;
          const isActive = idx === currentSlide;
          return (
            <div
              key={slide.src}
              className={`absolute inset-0 transition-opacity duration-700 ease-out ${
                isActive ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
              aria-hidden={!isActive}
            >
              <Link href={slide.href} aria-label={slide.label} className="absolute inset-0 block">
                <Image
                  src={slide.src}
                  alt={slide.label}
                  fill
                  priority={idx === 0}
                  onLoad={() => setHeroReady(true)}
                  className="object-cover object-center"
                  sizes="100vw"
                />
              </Link>
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-4 lg:px-8">
          <button
            type="button"
            onClick={prev}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/50 bg-white/80 text-[var(--oweg-ink)] shadow-md backdrop-blur-sm transition hover:bg-white"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={next}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/50 bg-white/80 text-[var(--oweg-ink)] shadow-md backdrop-blur-sm transition hover:bg-white"
            aria-label="Next slide"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Progress rails — one dot per slide actually shown at that breakpoint */}
      <div className="flex items-center justify-center gap-0.5 md:hidden">
        {MOBILE_HERO_SLIDES.map((slide, idx) => (
          <HeroDot
            key={`m-dot-${slide.src}`}
            active={currentSlide % MOBILE_HERO_SLIDES.length === idx}
            index={idx}
            onSelect={() => setCurrentSlide(idx)}
          />
        ))}
      </div>
      <div className="hidden items-center justify-center gap-0.5 md:flex">
        {HERO_SLIDES.map((slide, idx) => (
          <HeroDot
            key={`d-dot-${slide.src}`}
            active={currentSlide === idx}
            index={idx}
            onSelect={() => setCurrentSlide(idx)}
          />
        ))}
      </div>
    </section>
  );
}

// Promo Banners Component
function PromoBanners() {
  const banners = [
    {
      image: '/Inductions_Cooktops_banner.png',
      href: '/c/inductions-%26-cooktops',
      alt: 'Shop inductions and cooktops',
      
    },
    {
      image: '/Iron_banner.png',
      href: '/c/iron',
      alt: 'Shop irons',
    },
    {
      image: '/kettles_banner.png',
      href: '/c/kettles',
      alt: 'Shop kettles',
    },
    {
      image: '/Gas_Stoves_Hobs_banner.png',
      href: '/c/gas-stoves-%26-hobs',
      alt: 'Shop gas stoves and hobs',
    },
  ];

  return (
    <section className="oweg-section-tight">
      <div className="oweg-container">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {banners.map((banner) => (
            <BannerTile
              key={banner.href}
              src={banner.image}
              href={banner.href}
              alt={banner.alt}
              ratio="2.41"
              sizes="(min-width: 1024px) 25vw, 50vw"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Category discovery strip driven by the existing category SVG set. */
function CategoryStrip({ categories }: { categories: MobileCategory[] }) {
  if (!categories.length) return null;

  return (
    <section className="oweg-section-tight">
      <div className="oweg-container">
        <div className="oweg-section-head">
          <div className="min-w-0">
            <h2 className="oweg-title">Shop by category</h2>
            <p className="oweg-subtle mt-1">Every department, one tap away.</p>
          </div>
        </div>
        <div className="oweg-cat-strip oweg-rail-bleed scrollbar-hidden">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={cat.handle ? `/c/${encodeURIComponent(cat.handle)}` : '/c'}
              className="group flex flex-col items-center rounded-[var(--oweg-radius-md)] p-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--oweg-green)]"
            >
              <CategoryIconTile handle={cat.handle} title={cat.title} size="lg" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

type MobileCategory = {
  id: string;
  title: string;
  handle?: string;
  image?: string;
  children?: MobileCategory[];
  rank?: number;
};

type FeedSectionPayload = {
  key: string;
  title: string;
  handle?: string;
  href?: string;
  products: UIProduct[];
  sourceTag: string;
};

type HomeFeedPayload = {
  sections: FeedSectionPayload[];
  spotlight: FeedSectionPayload | null;
  popular: FeedSectionPayload | null;
  meta?: { categoriesTried: number; categoriesWithProducts: number; totalProducts: number };
};

export default function HomePage({
  initialFeed,
}: {
  initialFeed?: HomeFeedPayload;
}) {
  const { customer } = useAuth();
  const [placeName, setPlaceName] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('oweg_pincode_place') || null;
  });
  const [placeLoading, setPlaceLoading] = useState(false);
  const [pincode, setPincode] = useState('');
  const [pinInput, setPinInput] = useState('');

  useEffect(() => {
    const hydratePlace = async () => {
      if (pincode && !placeName) {
        const place = await fetchPlaceName(pincode);
        if (place) {
          setPlaceName(place);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('oweg_pincode_place', place);
          }
        }
      }
    };
    void hydratePlace();
  }, [pincode, placeName]);

  const homeFeedQuery = useQuery({
    queryKey: ['home-feed'],
    queryFn: async (): Promise<HomeFeedPayload> => {
      const res = await fetch('/api/home/feed');
      if (!res.ok) throw new Error('Unable to load home feed');
      return res.json();
    },
    ...(initialFeed ? { initialData: initialFeed } : {}),
    staleTime: 1000 * 60 * 2,
  });

  const autoSections = useMemo(() => {
    const feed = homeFeedQuery.data;
    if (!feed) return [] as Array<{
      title: string;
      products: UIProduct[];
      loading: boolean;
      sourceTag?: string;
      key: string;
    }>;

    const rows: Array<{
      title: string;
      products: UIProduct[];
      loading: boolean;
      sourceTag?: string;
      key: string;
    }> = [];

    if (feed.popular?.products?.length) {
      rows.push({
        key: feed.popular.key || 'popular-picks',
        title: feed.popular.title,
        products: feed.popular.products,
        loading: false,
        sourceTag: feed.popular.sourceTag,
      });
    }

    for (const section of feed.sections || []) {
      if (!section?.products?.length) continue;
      rows.push({
        key: section.key || section.title,
        title: section.title,
        products: section.products,
        loading: false,
        sourceTag: section.sourceTag,
      });
    }

    return rows;
  }, [homeFeedQuery.data]);

  const sectionsToRender = useMemo(() => {
    const seen = new Set<string>();
    const merged: typeof autoSections = [];

    const push = (section: (typeof autoSections)[number]) => {
      const key = (section.key || section.title || '').toLowerCase();
      if (!key || seen.has(key)) return;
      if (!section.loading && !(section.products?.length > 0)) return;
      seen.add(key);
      merged.push(section);
    };

    autoSections.forEach(push);

    if (merged.length === 0 && homeFeedQuery.isLoading) {
      return [
        {
          key: 'loading-1',
          title: 'Popular picks',
          products: [],
          loading: true,
        },
        {
          key: 'loading-2',
          title: 'Loading products',
          products: [],
          loading: true,
        },
        {
          key: 'loading-3',
          title: 'More to explore',
          products: [],
          loading: true,
        },
      ];
    }

    return merged;
  }, [autoSections, homeFeedQuery.isLoading]);

  const spotlightSection = homeFeedQuery.data?.spotlight?.products?.length
    ? homeFeedQuery.data.spotlight
    : null;

  const categoriesQuery = useStoreCategories();
  const categoriesData: MedusaCategory[] = useMemo(
    () => (Array.isArray(categoriesQuery.data) ? categoriesQuery.data : []),
    [categoriesQuery.data]
  );

  const brandCollectionsQuery = useQuery({
    queryKey: ['home-featured-brands'],
    queryFn: async () => {
      const res = await fetch('/api/medusa/featured-brands', { cache: 'no-store' });
      if (!res.ok) throw new Error('Unable to load featured brands');
      const data = await res.json();
      return (data.collections || []) as Array<{
        id: string;
        title?: string;
        handle?: string;
        metadata?: Record<string, unknown> | null;
      }>;
    },
    staleTime: 1000 * 60,
  });
  const brandCollections = brandCollectionsQuery.data ?? [];

  const mobileCategories: MobileCategory[] = useMemo(() => {
    const seen = new Set<string>();
    const roots = categoriesData.filter((cat) => {
      const parentId =
        (cat as MedusaCategory & { parent_category_id?: string | null }).parent_category_id ??
        (cat as MedusaCategory & { parent_category?: { id?: string | null } }).parent_category?.id;
      return !parentId;
    });

    const withChildren = roots.filter((cat) => {
      const children = (cat as MedusaCategory).category_children;
      return Array.isArray(children) && children.length > 0;
    });

    const result: MobileCategory[] = [];
    withChildren.forEach((node) => {
      if (!node) return;
      const id = (node.id || node.handle || node.title || node.name || Math.random().toString()).toString();
      if (seen.has(id)) return;
      seen.add(id);
      result.push({
        id,
        title: (node.title || node.name || 'Category').toString(),
        handle: node.handle || undefined,
        rank: typeof (node as MedusaCategory).rank === 'number' ? (node as MedusaCategory).rank : undefined,
        image:
          (node as MedusaCategory & { metadata?: { thumbnail?: string; image?: string } }).metadata?.thumbnail ||
          (node as MedusaCategory & { metadata?: { thumbnail?: string; image?: string } }).metadata?.image ||
          undefined,
      });
    });
    return result.sort((a, b) => {
      const rankA = a.rank ?? 9999;
      const rankB = b.rank ?? 9999;
      if (rankA !== rankB) return rankA - rankB;
      return a.title.localeCompare(b.title);
    });
  }, [categoriesData]);

  const loading =
    sectionsToRender.some((section) => section.loading) ||
    homeFeedQuery.isLoading;
  const feedError = homeFeedQuery.error;
  const errorMessage =
    feedError instanceof Error
      ? feedError.message
      : feedError
        ? 'Unable to load products'
        : null;
  const displayError = errorMessage;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('oweg_pincode');
    if (stored) {
      setPincode(stored);
      setPinInput(stored);
    }
    const storedPlace = window.localStorage.getItem('oweg_pincode_place');
    if (storedPlace) {
      setPlaceName(storedPlace);
    }
  }, []);

  const fetchPlaceName = async (pin: string) => {
    try {
      setPlaceLoading(true);
      const res = await fetch(`/api/pincode/${encodeURIComponent(pin)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { place?: string | null };
      const place = typeof data?.place === "string" && data.place.trim() ? data.place.trim() : null;
      return place;
    } catch {
      return null;
    } finally {
      setPlaceLoading(false);
    }
  };

  const handlePinSubmit = async () => {
    const trimmed = pinInput.trim();
    if (!trimmed) return;
    setPincode(trimmed);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('oweg_pincode', trimmed);
    }
    const place = await fetchPlaceName(trimmed);
    if (place) {
      setPlaceName(place);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('oweg_pincode_place', place);
      }
    }
  };

  return (
    <div className="oweg-page min-h-screen">
      <main className="w-full pb-8">
        <HeroBanner />

        <CategoryStrip categories={mobileCategories} />

        {(!pincode || !customer) && (
          <section className="oweg-section-tight">
            <div className="oweg-container grid gap-3 sm:gap-4 md:grid-cols-2">
              {!pincode ? (
                <div className="oweg-surface-card p-4 sm:p-5">
                  <p className="text-sm font-semibold text-[var(--oweg-ink)]">
                    Share your pincode for faster delivery by local sellers
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="relative flex-1">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--oweg-green)]" />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                        className="oweg-tap w-full rounded-xl border border-[var(--oweg-border-strong)] bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[var(--oweg-green)] focus:ring-2 focus:ring-[var(--oweg-green)]/25"
                        placeholder="Enter pincode"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handlePinSubmit}
                      className="oweg-tap whitespace-nowrap rounded-xl bg-[var(--oweg-green)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--oweg-green-dark)]"
                    >
                      Submit
                    </button>
                  </div>
                  {placeLoading ? (
                    <p className="mt-2 text-xs text-[var(--oweg-ink-muted)]">Checking serviceability...</p>
                  ) : null}
                </div>
              ) : null}

              {!customer && (
                <div className="oweg-surface-card flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--oweg-green)] text-white">
                    <UserRound className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--oweg-ink)] sm:text-base">You are missing out</p>
                    <p className="oweg-subtle line-clamp-2">Sign in for member pricing and faster checkout.</p>
                  </div>
                  <Link
                    href="/login"
                    className="oweg-tap flex items-center whitespace-nowrap rounded-xl bg-[var(--oweg-green)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--oweg-green-dark)]"
                  >
                    Sign in
                  </Link>
                </div>
              )}
            </div>
          </section>
        )}

        <FlashSaleSection />

        <section className="oweg-section-tight">
          <div className="oweg-container">
            <BannerTile
              src="/App_Banner-4.png"
              href="/c/kitchen-appliances"
              alt="Shop kitchen appliances"
              sizes="(min-width: 1400px) 1400px, 100vw"
            />
          </div>
        </section>

        {sectionsToRender.map((section, idx) => (
          <React.Fragment key={`${section.key || section.title}-${idx}`}>
            <ProductCarousel
              title={section.title}
              products={section.products}
              sourceTag={section.sourceTag}
              loading={section.loading}
            />
            {idx === 1 && <PromoBanners />}
            {idx === 2 && (
              <section className="oweg-section-tight">
                <div className="oweg-container grid gap-3 sm:gap-4 md:grid-cols-2">
                  <BannerTile
                    src="/App_Banner-5.png"
                    href="/c/home-appliances"
                    alt="Shop home appliances"
                    ratio="2.41"
                    sizes="(min-width: 768px) 50vw, 100vw"
                  />
                  <BannerTile
                    src="/App_Banner-7.png"
                    href="/c/computer-and-mobile-accessories"
                    alt="Shop computer and mobile accessories"
                    ratio="2.41"
                    sizes="(min-width: 768px) 50vw, 100vw"
                  />
                </div>
              </section>
            )}
            {idx === 3 && (
              <section className="oweg-section-tight">
                <div className="oweg-container space-y-3 sm:space-y-4">
                  <BannerTile
                    src="/App_Banner-6.png"
                    href="/c/ceiling-fans"
                    alt="Shop ceiling fans"
                    sizes="(min-width: 1400px) 1400px, 100vw"
                  />
                  <BannerTile
                    src="/App_Banner-8.png"
                    href="/c/water-heaters-%26-geysers"
                    alt="Shop water heaters and geysers"
                    sizes="(min-width: 1400px) 1400px, 100vw"
                  />
                </div>
              </section>
            )}
          </React.Fragment>
        ))}

        {sectionsToRender.length <= 1 && <PromoBanners />}

        <section className="oweg-section-tight">
          <div className="oweg-container">
            {BAG_SECTION_BANNERS.map((banner) => (
              <BannerTile
                key={banner.href}
                src={banner.image}
                href={banner.href}
                alt={banner.alt}
                sizes="(min-width: 1400px) 1400px, 100vw"
              />
            ))}
          </div>
        </section>

        {spotlightSection ? (
          <ProductCarousel
            title={spotlightSection.title}
            products={spotlightSection.products}
            sourceTag={spotlightSection.sourceTag}
          />
        ) : null}

        {brandCollectionsQuery.isLoading ? (
          <section className="oweg-section-tight">
            <div className="oweg-container">
              <div className="oweg-section-head">
                <h2 className="oweg-title">Top brands we carry</h2>
              </div>
              <div className="oweg-rail oweg-rail-bleed scrollbar-hidden">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-24 w-[150px] animate-pulse rounded-[var(--oweg-radius-lg)] border border-[var(--oweg-border)] bg-[var(--oweg-surface-subtle)] sm:w-[170px]"
                  />
                ))}
              </div>
            </div>
          </section>
        ) : brandCollections.length > 0 ? (
          <section className="oweg-section-tight">
            <div className="oweg-container">
              <div className="oweg-section-head">
                <div className="min-w-0">
                  <h2 className="oweg-title">Top brands we carry</h2>
                  <p className="oweg-subtle mt-1">Authorised stock, straight from the makers.</p>
                </div>
              </div>
              <div className="oweg-rail oweg-rail-bleed scrollbar-hidden">
                {brandCollections.map((brand) => {
                  const logo = resolveBrandLogo({
                    title: brand.title,
                    handle: brand.handle,
                    logoUrl: getCollectionLogoUrl(brand.metadata),
                    logoScale: getCollectionLogoScale(brand.metadata),
                  });
                  const slug = brand.handle || normalizeBrandKey(brand.title) || brand.id;
                  return (
                    <Link
                      key={brand.id}
                      href={`/brands/${encodeURIComponent(slug)}?from=home`}
                      className="oweg-surface-card group flex h-24 w-[150px] items-center justify-center overflow-hidden px-3 py-2 transition hover:-translate-y-1 hover:shadow-[var(--oweg-shadow-md)] sm:w-[170px]"
                    >
                      <BrandLogoImage
                        src={logo.src}
                        alt={brand.title || 'Brand logo'}
                        scale={logo.scale}
                        maxWidth={136}
                        maxHeight={64}
                        parentMaxWidth={144}
                        parentMaxHeight={72}
                        onError={brandLogoFallbackHandler}
                      />
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {loading && (
          <div className="oweg-container py-3">
            <div className="h-14 w-full animate-pulse rounded-[var(--oweg-radius-lg)] bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100" />
          </div>
        )}
        {!loading && displayError && (
          <div className="oweg-container text-sm text-red-500">{displayError}</div>
        )}
      </main>
    </div>
  );
}

