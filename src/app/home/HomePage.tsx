'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, MapPin, UserRound } from 'lucide-react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { ProductCard } from '@/components/modules/ProductCard';
import type { MedusaCategory } from '@/lib/medusa';
import { useAuth } from '@/contexts/AuthProvider';
import PreferenceModal from '@/components/modules/PreferenceModal';
import { usePreferences } from '@/hooks/usePreferences';
import { useStoreCategories } from '@/hooks/useStoreCategories';
import { buildPreferenceSlug } from '@/lib/personalization';
import { normalizeBrandKey, resolveBrandLogo, getCollectionLogoUrl, getCollectionLogoScale } from '@/lib/brand-logos';
import { BrandLogoImage, brandLogoFallbackHandler } from '@/components/modules/BrandLogoImage';
import FlashSaleSection from '@/components/flash-sale/FlashSaleSection';

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

type ProductQuery = {
  tag?: string;
  type?: string;
  category?: string;
  limit?: number;
};

async function fetchProducts(query: ProductQuery, limitFallback = 20): Promise<UIProduct[]> {
  const params = new URLSearchParams();
  if (query.tag) params.set('tag', query.tag);
  if (query.type) params.set('type', query.type);
  if (query.category) params.set('category', query.category);
  params.set('limit', String(query.limit ?? limitFallback));
  const url = `/api/medusa/products?${params.toString()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Unable to load products');
  }
  const data = await res.json();
  return (data?.products || []) as UIProduct[];
}

// Product Carousel Component
function ProductCarousel({
  title,
  products,
  sourceTag,
  loading,
  paddingClass = 'px-4',
}: {
  title: string;
  products: UIProduct[];
  sourceTag?: string;
  loading?: boolean;
  paddingClass?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 220;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const skeletonCards = Array.from({ length: 8 }).map((_, idx) => (
    <div
      key={`loader-${idx}`}
      className="flex-shrink-0 w-[200px] sm:w-[220px] md:w-[260px] lg:w-[300px] rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden animate-pulse"
    >
      <div className="h-40 sm:h-48 bg-gray-100" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-2/3 bg-gray-200 rounded" />
        <div className="h-3 w-1/2 bg-gray-200 rounded" />
        <div className="h-5 w-full bg-gray-200 rounded" />
      </div>
    </div>
  ));

  return (
    <div className={`mb-8 ${paddingClass}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900 transition-all duration-300 hover:text-green-600">{title}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => scroll('left')}
            className="w-8 h-8 rounded-full bg-white border border-gray-300 flex items-center justify-center hover:bg-gray-50 hover:border-green-500 transition-all duration-300 hover:scale-110"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-8 h-8 rounded-full bg-white border border-gray-300 flex items-center justify-center hover:bg-gray-50 hover:border-green-500 transition-all duration-300 hover:scale-110"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        // make sure scrollbar-hidden class is present (utility defined in this file's global styles)
        className="flex gap-4 overflow-x-auto scrollbar-hidden pb-4 scroll-smooth snap-x snap-mandatory"
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
              <div key={product.id} className="flex-shrink-0 w-[200px] sm:w-[220px] md:w-[260px] lg:w-[300px]">
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
  { image: '/kitchen-appliances_banner.png', href: '/c/kitchen-appliances', alt: 'Shop kitchen appliances' },
  { image: '/ceiling-fans_banner.png', href: '/c/ceiling-fans', alt: 'Shop ceiling fans' },
  { image: '/Mixer_banner.png', href: '/c/mixer-grinders', alt: 'Shop mixer grinders' },
];

const MOBILE_TOP_BANNERS: Array<{ src: string; href: string; alt: string }> = [
  { src: '/App_Banner-1.jpg', href: '/specials', alt: 'Explore Specials' },
  { src: '/App_Banner-3.jpg', href: '/c/kitchen-appliances', alt: 'Shop kitchen appliances' },
];

function MobileBanner({
  src,
  href,
  alt,
  priority = false,
}: {
  src: string;
  href: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    <Link href={href} className="relative w-full h-34 overflow-hidden shadow-sm border border-gray-100 block">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-container"
        sizes="(max-width: 768px) 100vw, 0px"
        priority={priority}
      />
    </Link>
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

  return (
    <div className="relative w-full h-[320px] md:h-[400px] rounded-2xl overflow-hidden mb-8 transition-all duration-700">
      {!heroReady && <div className="absolute inset-0 z-10 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-pulse" />}
      <div
        className={`absolute inset-0 transition-all duration-700 ${heroReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
      <div className="absolute inset-0 flex items-center justify-between px-3 sm:px-6 z-10 pointer-events-none">
        <button
          onClick={prev}
          className="w-9 h-9 sm:w-12 sm:h-12 bg-white/85 backdrop-blur-sm rounded-full hidden md:flex items-center justify-center shadow-lg hover:bg-white hover:scale-110 transition-all duration-300 pointer-events-auto"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
        </button>
        <button
          onClick={next}
          className="w-9 h-9 sm:w-12 sm:h-12 bg-white/85 backdrop-blur-sm rounded-full hidden md:flex items-center justify-center shadow-lg hover:bg-white hover:scale-110 transition-all duration-300 pointer-events-auto"
          aria-label="Next slide"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
        </button>
      </div>
      <div className="relative w-full h-full min-h-[320px] sm:min-h-[360px]">
        {HERO_SLIDES.map((slide, idx) => {
          const dist = Math.min(
            Math.abs(idx - currentSlide),
            HERO_SLIDES.length - Math.abs(idx - currentSlide)
          );
          if (dist > 1) return null;
          return (
          <div
            key={slide.src}
            className={`absolute inset-0 transition-opacity duration-700 ${
              idx === currentSlide ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            aria-hidden={idx !== currentSlide}
          >
            <Link href={slide.href} aria-label={slide.label} className="absolute inset-0 block">
              <Image
                src={slide.src}
                alt={slide.label}
                fill
                priority={idx === 0}
                onLoad={() => setHeroReady(true)}
                className="object-container object-center"
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent md:from-black/30 md:via-black/10 md:to-transparent" />
            </Link>
          </div>
          );
        })}
      </div>
      <div className="absolute inset-0 pointer-events-none" />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 md:hidden">
        {HERO_SLIDES.map((_, idx) => {
          const isActive = idx === currentSlide;
          return (
            <button
              key={`dot-${idx}`}
              type="button"
              onClick={() => setCurrentSlide(idx)}
              className={`h-2 rounded-full transition-all ${isActive ? 'w-6 bg-white' : 'w-2 bg-white/50'}`}
            />
          );
        })}
      </div>
      </div>
    </div>
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
    <div className="hidden md:grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
      {banners.map((banner) => (
        <Link
          key={banner.href}
          href={banner.href}
          aria-label={banner.alt}
          className="relative h-52 overflow-hidden shadow border border-gray-100 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
        >
          <Image
            src={banner.image}
            alt={banner.alt}
            fill
            className="object-container"
            sizes="(min-width: 1024px) 25vw, 100vw"
          />
        </Link>
      ))}
    </div>
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
  const { preferences, hasPreferences, loading: prefLoading, saving: prefSaving, savePreferences } = usePreferences();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [placeName, setPlaceName] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('oweg_pincode_place') || null;
  });
  const [placeLoading, setPlaceLoading] = useState(false);
  const [pincode, setPincode] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [personalizedReady, setPersonalizedReady] = useState(false);

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

  useEffect(() => {
    if (!customer || !hasPreferences) {
      setPersonalizedReady(false);
      return;
    }
    const run = () => setPersonalizedReady(true);
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const t = globalThis.setTimeout(run, 1200);
    return () => globalThis.clearTimeout(t);
  }, [customer, hasPreferences]);

  const homeFeedQuery = useQuery({
    queryKey: ['home-feed'],
    queryFn: async (): Promise<HomeFeedPayload> => {
      const res = await fetch('/api/home/feed');
      if (!res.ok) throw new Error('Unable to load home feed');
      return res.json();
    },
    initialData: initialFeed,
    staleTime: 1000 * 60 * 2,
  });

  const personalizedSections = useMemo(() => {
    if (!customer || !hasPreferences || !preferences) return [];
    const seen = new Set<string>();
    const items: Array<{ key: string; title: string; query: ProductQuery; sourceTag?: string }> = [];

    const push = (title: string, query: ProductQuery, sourceTag?: string) => {
      const key = buildPreferenceSlug(title || sourceTag || JSON.stringify(query));
      if (!key || seen.has(key)) return;
      seen.add(key);
      items.push({ key, title, query, sourceTag });
    };

    preferences.categories.forEach((cat) => push(cat, { category: cat, limit: 32 }, `category:${cat}`));
    preferences.productTypes.forEach((type) => push(type, { type, limit: 32 }, `type:${type}`));
    preferences.brands.forEach((brand) => push(`${brand} picks`, { tag: brand, limit: 32 }, `brand:${brand}`));

    return items.slice(0, 3);
  }, [customer, hasPreferences, preferences]);

  const personalizedQueries = useQueries({
    queries: personalizedSections.map((section) => ({
      queryKey: ['personalized-home', section.key, section.query],
      queryFn: () => fetchProducts(section.query, 32),
      enabled:
        personalizedReady &&
        Boolean(customer) &&
        hasPreferences &&
        personalizedSections.length > 0 &&
        !prefLoading,
      staleTime: 1000 * 60 * 5,
      placeholderData: (prev: UIProduct[] | undefined) => prev,
    })),
  });

  const autoSections = useMemo(() => {
    const feed = homeFeedQuery.data;
    if (!feed) return [] as Array<{
      title: string;
      products: UIProduct[];
      loading: boolean;
      sourceTag?: string;
      isPersonalized: boolean;
      key: string;
    }>;

    const rows: Array<{
      title: string;
      products: UIProduct[];
      loading: boolean;
      sourceTag?: string;
      isPersonalized: boolean;
      key: string;
    }> = [];

    if (feed.popular?.products?.length) {
      rows.push({
        key: feed.popular.key || 'popular-picks',
        title: feed.popular.title,
        products: feed.popular.products,
        loading: false,
        sourceTag: feed.popular.sourceTag,
        isPersonalized: false,
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
        isPersonalized: false,
      });
    }

    return rows;
  }, [homeFeedQuery.data]);

  const personalizedSectionsData = personalizedSections.map((section, idx) => ({
    key: section.key,
    title: section.title,
    products: personalizedQueries[idx]?.data ?? [],
    loading:
      personalizedQueries[idx]?.isLoading ||
      (!personalizedQueries[idx]?.data && personalizedQueries[idx]?.isFetching) ||
      false,
    sourceTag: section.sourceTag,
    isPersonalized: true,
  }));

  const personalizedLoading =
    hasPreferences &&
    personalizedSections.length > 0 &&
    personalizedSectionsData.some((section) => section.loading);

  const sectionsToRender = useMemo(() => {
    const personalizedFilled = personalizedSectionsData.filter(
      (section) => section.loading || (section.products?.length ?? 0) > 0
    );
    const seen = new Set<string>();
    const merged: typeof autoSections = [];

    const push = (section: (typeof autoSections)[number]) => {
      const key = (section.key || section.title || '').toLowerCase();
      if (!key || seen.has(key)) return;
      if (!section.loading && !(section.products?.length > 0)) return;
      seen.add(key);
      merged.push(section);
    };

    personalizedFilled.forEach(push);
    autoSections.forEach(push);

    if (merged.length === 0 && homeFeedQuery.isLoading) {
      return [
        {
          key: 'loading-1',
          title: 'Popular picks',
          products: [],
          loading: true,
          isPersonalized: false,
        },
        {
          key: 'loading-2',
          title: 'Loading products',
          products: [],
          loading: true,
          isPersonalized: false,
        },
        {
          key: 'loading-3',
          title: 'More to explore',
          products: [],
          loading: true,
          isPersonalized: false,
        },
      ];
    }

    return merged;
  }, [autoSections, personalizedSectionsData, homeFeedQuery.isLoading]);

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

  const categorySuggestions = useMemo(
    () => mobileCategories.slice(0, 12).map((cat) => cat.title),
    [mobileCategories]
  );

  const loading =
    sectionsToRender.some((section) => section.loading) ||
    homeFeedQuery.isLoading ||
    personalizedLoading;
  const feedError = homeFeedQuery.error;
  const personalizedError = personalizedQueries.find((q) => q?.error)?.error;
  const errorMessage =
    feedError instanceof Error
      ? feedError.message
      : feedError
        ? 'Unable to load products'
        : personalizedError instanceof Error
          ? personalizedError.message
          : personalizedError
            ? 'Unable to load your picks'
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
    <div className="min-h-screen bg-gray-50">
      <main className="w-full pb-6 md:pt-6 md:pb-6">
        <div className="md:hidden px-4 pt-3 space-y-3">
          <div className="space-y-2">
            {!pincode ? (
              <>
                <p className="text-sm font-semibold text-gray-900">Share pincode for faster delivery by local sellers</p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <MapPin className="w-4 h-4 text-[#7AC943] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2 text-sm"
                      placeholder="Enter pincode"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handlePinSubmit}
                    className="px-3 py-2 rounded-xl bg-[#7AC943] text-white text-sm font-semibold shadow hover:brightness-95 whitespace-nowrap"
                  >
                    Submit
                  </button>
                </div>
                {placeLoading ? <p className="text-xs text-gray-500">Checking serviceability...</p> : null}
              </>
            ) : null}
          </div>

          {!customer && (
            <div className="flex items-center gap-3 px-2 py-2 rounded-2xl bg-emerald-50/70">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#7AC943] text-white shrink-0">
                <UserRound className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-emerald-800 leading-snug">You are missing out</p>
                <p className="text-sm text-emerald-700 leading-snug line-clamp-2">Sign in for the best offers.</p>
              </div>
              <Link
                href="/login"
                className="px-4 py-2.5 rounded-xl bg-[#7AC943] text-white text-sm font-semibold shadow hover:brightness-95 whitespace-nowrap"
              >
                Sign in
              </Link>
            </div>
          )}
        </div>

        <div className="md:hidden px-4 mb-6 space-y-4">
          {MOBILE_TOP_BANNERS.map((banner, index) => (
            <MobileBanner
              key={banner.src}
              src={banner.src}
              href={banner.href}
              alt={banner.alt}
              priority={index === 0}
            />
          ))}
        </div>
        <div className="px-4">
          <div className="hidden md:block">
            <HeroBanner />
          </div>
        </div>

        <FlashSaleSection />
        <div className="md:hidden px-4 mt-8 mb-4">
          <MobileBanner src="/App_Banner-4.png" href="/c/kitchen-appliances" alt="Shop kitchen appliances" />
        </div>

        {customer ? (
          <div className="px-4 mt-4">
            {hasPreferences ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-start gap-3">
                  
                  <div>
                    <p className="text-xs text-emerald-700">Showing your favourite categories, types, and brands first.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreferencesOpen(true)}
                  className="px-4 py-2 rounded-xl border border-emerald-200 bg-white text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  Edit preferences
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-start gap-3">
                  
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Get a better home feed</p>
                    <p className="text-xs text-amber-700">Tell us what you shop often to surface those first.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreferencesOpen(true)}
                  className="px-4 py-2 rounded-xl border border-amber-200 bg-white text-sm font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Set preferences
                </button>
              </div>
            )}
          </div>
        ) : null}

        {sectionsToRender.map((section, idx) => (
          <div key={`${section.key || section.title}-${idx}`}>
            <ProductCarousel
              title={section.title}
              products={section.products}
              sourceTag={section.sourceTag}
              loading={section.loading || (personalizedLoading && section.isPersonalized)}
            />
            {idx === 1 && (
              <div className="px-4">
                <PromoBanners />
              </div>
            )}
            {idx === 2 && (
              <div className="md:hidden px-4 mb-4 space-y-4">
                <MobileBanner src="/App_Banner-5.png" href="/c/home-appliances" alt="Shop home appliances" />
                <MobileBanner src="/App_Banner-6.png" href="/c/ceiling-fans" alt="Shop ceiling fans" />
              </div>
            )}
            {idx === 3 && (
              <div className="md:hidden px-4 mt-4 space-y-4">
                <MobileBanner
                  src="/App_Banner-7.png"
                  href="/c/computer-and-mobile-accessories"
                  alt="Shop computer and mobile accessories"
                />
                <MobileBanner
                  src="/App_Banner-8.png"
                  href="/c/water-heaters-%26-geysers"
                  alt="Shop water heaters and geysers"
                />
              </div>
            )}
          </div>
        ))}
        {sectionsToRender.length <= 1 && (
          <div className="px-4">
            <PromoBanners />
          </div>
        )}
        <div className="px-4 md:px-4 mt-10 space-y-4">
          <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-4">
            {BAG_SECTION_BANNERS.map((banner) => (
              <Link
                key={banner.href}
                href={banner.href}
                aria-label={banner.alt}
                className="relative h-48 overflow-hidden border border-gray-100 bg-white shadow transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <Image src={banner.image} alt={banner.alt} fill className="object-container" sizes="(min-width: 768px) 33vw, 100vw" />
              </Link>
            ))}
          </div>
          {spotlightSection ? (
            <ProductCarousel
              title={spotlightSection.title}
              products={spotlightSection.products}
              sourceTag={spotlightSection.sourceTag}
              paddingClass="px-2 md:px-4"
            />
          ) : null}
        </div>
        {brandCollectionsQuery.isLoading ? (
          <div className="px-4 mt-10">
            <div className="p-4 sm:p-6 space-y-4">
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Top brands we carry</h1>
              <div className="flex gap-4 overflow-x-auto scrollbar-hidden pb-3">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="min-w-[170px] h-24 rounded-2xl border border-gray-100 bg-gray-50 animate-pulse"
                  />
                ))}
              </div>
            </div>
          </div>
        ) : brandCollections.length > 0 ? (
          <div className="px-4 mt-10">
            <div className="p-4 sm:p-6 space-y-4">
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Top brands we carry</h1>
              <div className="flex gap-4 overflow-x-auto scrollbar-hidden pb-3">
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
                      className="group min-w-[170px] h-24 rounded-2xl border border-gray-100 bg-white shadow-sm flex items-center justify-center px-3 py-2 overflow-hidden hover:-translate-y-1 transition hover:shadow-[0_15px_36px_-24px_rgba(0,0,0,0.35)]"
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
          </div>
        ) : null}
        <div className="md:hidden px-4 mb-8">
          <MobileBanner src="/App_Banner-9.png" href="/c/kitchen-appliances" alt="Shop kitchen appliances" />
        </div>
        {loading && (
          <div className="px-4 py-3">
            <div className="w-full rounded-2xl bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-pulse h-14" />
          </div>
        )}
        {!loading && displayError && <div className="px-4 text-sm text-red-500">{displayError}</div>}
      </main>

      <PreferenceModal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        onSave={async (prefs) => {
          try {
            await savePreferences(prefs);
            setPreferencesOpen(false);
          } catch (err) {
            console.error('Failed to save preferences', err);
          }
        }}
        saving={prefSaving}
        initial={preferences ?? undefined}
        suggestedCategories={categorySuggestions}
      />
    </div>
  );
}

