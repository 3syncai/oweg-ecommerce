'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, ChevronLeft, ChevronRight, MapPin, Pause, Play, UserRound } from 'lucide-react';
import styles from './HomePage.module.css';
import { useQuery } from '@tanstack/react-query';
import { ProductCard } from '@/components/modules/ProductCard';
import { useAuth } from '@/contexts/AuthProvider';
import { normalizeBrandKey, resolveBrandLogo, getCollectionLogoUrl, getCollectionLogoScale } from '@/lib/brand-logos';
import { BrandLogoImage, brandLogoFallbackHandler } from '@/components/modules/BrandLogoImage';
import FlashSaleSection from '@/components/flash-sale/FlashSaleSection';
import HomeDiscovery from './HomeDiscovery';
import { HOME_SUBCATEGORIES } from '@/lib/home-subcategories';

// UI product type (used by carousel/cards)
type UIProduct = {
  id: string | number;
  catalog_product_id?: string;
  name: string;
  image: string;
  price: number;
  mrp: number;
  discount: number;
  limitedDeal?: boolean;
  variant_id?: string;
  variant_count?: number;
  handle?: string;
  sourceTag?: string;
  inventory_quantity?: number;
};

// Product Carousel Component
function ProductCarousel({
  title,
  products,
  sourceTag,
  href,
  loading,
}: {
  title: string;
  products: UIProduct[];
  sourceTag?: string;
  href?: string;
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
          <div className="min-w-0">
            <p className={styles.eyebrow}>{title === 'Popular picks' ? 'Worth a look' : 'Discover more'}</p>
            <h2 className="oweg-title">{title}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {href && <Link href={href} className={styles.viewAll}>View all <ArrowUpRight size={14} /></Link>}
            <button
              type="button"
              onClick={() => scroll('left')}
              className="oweg-rail-btn hidden sm:inline-flex"
              aria-label={`Scroll ${title} left`}
            >
              <ChevronLeft className="w-4.5 h-4.5" />
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              className="oweg-rail-btn hidden sm:inline-flex"
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
                      variant_count={product.variant_count}
                      handle={product.handle}
                      sourceTag={sourceTag}
                      inventory_quantity={product.inventory_quantity}
                      showImageFallback
                      prefetch={false}
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
  { src: '/main-banners/creative-v2/home-desktop.webp', mobileSrc: '/main-banners/creative-v2/home-mobile.webp', href: '/c/home-appliances', label: 'Big little home upgrades — shop the home sale, up to 80% off' },
  { src: '/main-banners/creative-v2/bags-desktop.webp', mobileSrc: '/main-banners/creative-v2/bags-mobile.webp', href: '/c/bags', label: 'Carry a little more you — shop everyday bags' },
  { src: '/main-banners/creative-v2/technology-desktop.webp', mobileSrc: '/main-banners/creative-v2/technology-mobile.webp', href: '/c/computer-%26-mobile-accessories', label: 'Plug into possibilities — shop computer and mobile accessories' },
  { src: '/main-banners/creative-v2/health-desktop.webp', mobileSrc: '/main-banners/creative-v2/health-mobile.webp', href: '/c/health-care', label: 'A moment, just for you — shop Sassiest Health Care' },
  { src: '/main-banners/creative-v2/kitchen-desktop.webp', mobileSrc: '/main-banners/creative-v2/kitchen-mobile.webp', href: '/c/kitchen-appliances', label: 'Good food. Great company. — shop kitchen appliances' },
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
  const [isPaused, setIsPaused] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDelta, setTouchDelta] = useState(0);

  useEffect(() => {
    if (isHovered || isPaused || isFocused || reducedMotion || touchStart !== null) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [isHovered, isPaused, isFocused, reducedMotion, touchStart]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

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


  return (
    <section
      className={`${styles.hero} relative w-full overflow-hidden`}
      aria-roledescription="carousel"
      aria-label="Featured offers"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsFocused(false);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* One responsive image stage; preserve the complete supplied SVG artwork. */}
      <div className={`${styles.heroStage} relative w-full`}>
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
              <Link href={slide.href} aria-label={slide.label} tabIndex={isActive ? 0 : -1} className="absolute inset-0 block">
                <picture>
                  <source media="(max-width: 767px)" srcSet={slide.mobileSrc} />
                  <Image
                    src={slide.src}
                    alt={slide.label}
                    fill
                    unoptimized
                    loading={idx === 0 ? 'eager' : 'lazy'}
                    fetchPriority={idx === 0 ? 'high' : 'auto'}
                    onLoad={() => setHeroReady(true)}
                    className="object-contain object-center"
                    sizes="100vw"
                  />
                </picture>
              </Link>
            </div>
          );
        })}

      </div>

      <button type="button" onClick={prev} className={`${styles.heroArrow} ${styles.heroPrevious}`} aria-label="Previous slide">
        <ChevronLeft size={20} aria-hidden />
      </button>
      <button type="button" onClick={next} className={`${styles.heroArrow} ${styles.heroNext}`} aria-label="Next slide">
        <ChevronRight size={20} aria-hidden />
      </button>
      <div className={styles.heroDots}>
        {HERO_SLIDES.map((slide, idx) => (
          <HeroDot key={slide.src} active={currentSlide === idx} index={idx} onSelect={() => setCurrentSlide(idx)} />
        ))}
      </div>
      <button type="button" className={styles.pauseButton} onClick={() => setIsPaused((paused) => !paused)} aria-label={isPaused ? 'Resume offer slideshow' : 'Pause offer slideshow'} aria-pressed={isPaused}>
        {isPaused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
      </button>
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
        <div className="oweg-section-head">
          <div>
            <p className={styles.eyebrow}>Make room for the everyday</p>
            <h2 className="oweg-title">A little kitchen inspiration</h2>
          </div>
        </div>
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

/** Supplied artwork includes its own label and frame. */
function CategoryStrip() {
  return (
    <section id="home-categories" className={`oweg-section-tight ${styles.categories}`}>
      <div className="oweg-container">
        <div className="oweg-section-head">
          <div className="min-w-0">
            <h2 className="oweg-title">Shop by Sub-Category</h2>
          </div>
        </div>
        <div className={styles.categoryGrid} role="region" aria-label="Shop subcategories" tabIndex={0}>
          {HOME_SUBCATEGORIES.map((cat) => (
            <Link
              key={cat.href}
              href={cat.href}
              prefetch={false}
              className={`group ${styles.categoryTile}`}
            >
              <Image src={`/subcategory-banners/${cat.image}`} alt={cat.title}
                width={1145} height={1536} sizes="(max-width: 639px) 72px, 104px"
                className={styles.categoryArtwork}
                style={cat.artworkScale ? { transform: `scale(${cat.artworkScale})` } : undefined} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

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
      href?: string;
      key: string;
    }>;

    const rows: Array<{
      title: string;
      products: UIProduct[];
      loading: boolean;
      sourceTag?: string;
      href?: string;
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
        href: section.href,
      });
    }

    return rows;
  }, [homeFeedQuery.data]);

  const sectionsToRender = useMemo(() => {
    const seen = new Set<string>();
    const merged: typeof autoSections = [];
    const seenProducts = new Set<string>();

    const push = (section: (typeof autoSections)[number]) => {
      const key = (section.key || section.title || '').toLowerCase();
      if (!key || seen.has(key)) return;
      if (!section.loading && !(section.products?.length > 0)) return;
      seen.add(key);
      const products = section.products.filter(product => {
        const id = product.catalog_product_id || String(product.id);
        if (!(Number(product.inventory_quantity) > 0) || seenProducts.has(id)) return false;
        seenProducts.add(id);
        return true;
      });
      if (section.loading || products.length) merged.push({ ...section, products });
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

  const spotlightSection = useMemo(() => {
    const section = homeFeedQuery.data?.spotlight;
    if (!section) return null;
    const seen = new Set(sectionsToRender.flatMap(row => row.products.map(product => product.catalog_product_id || String(product.id))));
    const products = section.products.filter(product => Number(product.inventory_quantity) > 0 && !seen.has(product.catalog_product_id || String(product.id)));
    return products.length ? { ...section, products } : null;
  }, [homeFeedQuery.data?.spotlight, sectionsToRender]);

  const discoveryExcludedIds = useMemo(() => Array.from(new Set([
    ...sectionsToRender.flatMap(section => section.products),
    ...(spotlightSection?.products || []),
  ].map(product => product.catalog_product_id || String(product.id)))), [sectionsToRender, spotlightSection]);

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
    <div className={`oweg-page min-h-screen ${styles.home}`}>
      <main className={`w-full pb-8 ${styles.content}`}>
        <h1 className="sr-only">Good finds. Everyday living.</h1>
        <HeroBanner />

        <CategoryStrip />

        <FlashSaleSection showImageFallback inStockOnly />

        <section className="oweg-section-tight">
          <div className={`oweg-container ${styles.pageBannerPair}`}>
            <BannerTile
              src="/page-banners/appliances-wide-v2.webp"
              href="/c/kitchen-appliances"
              alt="Up to 80% off selected appliances — shop kitchen appliances"
              ratio="3.28"
              sizes="(min-width: 640px) 50vw, 100vw"
            />
            <BannerTile
              src="/page-banners/coupon-wide-v2.webp"
              href="/coupon-policy"
              alt="Use OWEG10 on your first purchase — view coupon terms"
              ratio="3.28"
              sizes="(min-width: 640px) 50vw, 100vw"
            />
          </div>
        </section>

        {(!pincode || !customer) && (
          <section className="oweg-section-tight">
            <div className="oweg-container grid gap-3 sm:gap-4 md:grid-cols-2">
              {!pincode ? (
                <div className={`oweg-surface-card p-4 sm:p-5 ${styles.deliveryCard}`}>
                  <p className="text-sm font-semibold text-[var(--oweg-ink)]">
                    Share your pincode for faster delivery by local sellers
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="relative flex-1">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--oweg-green)]" />
                      <input
                        aria-label="Delivery pincode"
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
                      className={`oweg-tap ${styles.primaryLink}`}
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
                    <p className="text-sm font-semibold text-[var(--oweg-ink)] sm:text-base">Make yourself at home</p>
                    <p className="oweg-subtle line-clamp-2">Sign in for member pricing and faster checkout.</p>
                  </div>
                  <Link
                    href="/login"
                    className={`oweg-tap ${styles.primaryLink}`}
                  >
                    Sign in
                  </Link>
                </div>
              )}
            </div>
          </section>
        )}


        {sectionsToRender.map((section, idx) => (
          <React.Fragment key={`${section.key || section.title}-${idx}`}>
            <ProductCarousel
              title={section.title}
              products={section.products}
              sourceTag={section.sourceTag}
              href={section.href}
              loading={section.loading}
            />
            {idx === 1 && <PromoBanners />}
            {idx === 3 && (
              <section className="oweg-section-tight">
                <div className={`oweg-container ${styles.giftingRow}`}>
                  <BannerTile
                    src="/page-banners/fans-wide-v2.webp"
                    href="/c/ceiling-fans"
                    alt="Shop ceiling fans"
                    ratio="3.28"
                    sizes="(min-width: 640px) 50vw, 100vw"
                  />
                  <BannerTile
                    src="/page-banners/gifting-wide-v2.webp"
                    href="/c/kitchen-appliances"
                    alt="Gifting items — explore kitchen appliances and gift ideas"
                    ratio="3.28"
                    sizes="(min-width: 640px) 50vw, 100vw"
                  />
                </div>
              </section>
            )}
          </React.Fragment>
        ))}

        {sectionsToRender.length <= 1 && <PromoBanners />}



        {spotlightSection ? (
          <ProductCarousel
            title={spotlightSection.title}
            products={spotlightSection.products}
            sourceTag={spotlightSection.sourceTag}
            href={spotlightSection.href}
          />
        ) : null}

        {brandCollectionsQuery.isLoading ? (
          <section className={`oweg-section-tight ${styles.brands}`}>
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
          <section className={`oweg-section-tight ${styles.brands}`}>
            <div className="oweg-container">
              <div className="oweg-section-head">
                <div className="min-w-0">
                  <h2 className="oweg-title">Top brands we carry</h2>
                  <p className="oweg-subtle mt-1">Familiar names. Fresh possibilities.</p>
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

        <HomeDiscovery excludeIds={discoveryExcludedIds} />

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

