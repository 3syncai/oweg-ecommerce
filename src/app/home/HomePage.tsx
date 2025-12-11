'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Loader2, MapPin, UserRound } from 'lucide-react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { ProductCard } from '@/components/modules/ProductCard';
import type { MedusaCategory } from '@/lib/medusa';
import { useAuth } from '@/contexts/AuthProvider';
import PreferenceModal from '@/components/modules/PreferenceModal';
import { usePreferences } from '@/hooks/usePreferences';
import { buildPreferenceSlug } from '@/lib/personalization';
import { getBrandLogoPath, getBrandLogoScale, normalizeBrandKey } from '@/lib/brand-logos';
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
          : products.map((product) => (
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
  { src: '/App_Banner-2.jpg', href: '/vendors/sellerjoin', alt: 'Join as vendor' },
  { src: '/App_Banner-3.jpg', href: '/c/kitchen-appliances', alt: 'Shop kitchen appliances' },
];

function MobileBanner({ src, href, alt}: { src: string; href: string; alt: string; unoptimized?: boolean }) {
  return (
    <Link href={href} className="relative w-full h-34 overflow-hidden shadow-sm border border-gray-100 block">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-container"
        sizes="(max-width: 768px) 100vw, 0px"
        unoptimized
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
        {HERO_SLIDES.map((slide, idx) => (
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
                unoptimized
                onLoad={() => setHeroReady(true)}
                className="object-container object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent md:from-black/30 md:via-black/10 md:to-transparent" />
            </Link>
          </div>
        ))}
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
            unoptimized
            className="object-container"
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
};

const categoryImageMap: Record<string, string> = {
  'home-appliances': '/Home Appliances.png',
  'kitchen-appliances': '/Kitchen Appliances.png',
  'beauty-personal-care': '/beauty-personal-care.png',
  'beauty-and-personal-care': '/beauty-personal-care.png',
  'computer-mobile': '/Computer & Mobile v1.png',
  'computer-mobile-accessories': '/Computer & Mobile v1.png',
  'computer-and-mobile-accessories': '/Computer & Mobile v1.png',
  'computer-mobile-acc': '/Computer & Mobile v1.png',
  'mobile-accessories': '/Computer & Mobile v1.png',
  hardware: '/Hardwear-01.png',
  'hard-wear': '/Hardwear-01.png',
  bags: '/Bags-01.png',
  clothing: '/Clothing-01.png',
  'security-surveillance': '/security & surveillance.png',
  'surveillance-security': '/security & surveillance.png',
  'surveillance-and-security': '/security & surveillance.png',
  'security-and-surveillance': '/security & surveillance.png',
  'toys-and-games': '/Toysandgames.png',
  jewellery: '/Jewellery.png',
  umbrella: '/Umbrella.png',
  'health-care': '/Sassiest-Health-Care.png',
  health: '/Sassiest-Health-Care.png',
  stationery: '/Stationery.png',
  stationary: '/Stationery.png',
};

const categoryImageKeywords: Array<{ image: string; includes: string[] }> = [
  { image: '/Computer & Mobile v1.png', includes: ['computer', 'mobile'] },
  { image: '/Computer & Mobile v1.png', includes: ['mobile', 'accessor'] },
  { image: '/Computer & Mobile v1.png', includes: ['computer', 'accessor'] },
  { image: '/security & surveillance.png', includes: ['security'] },
  { image: '/security & surveillance.png', includes: ['surveillance'] },
];

function MobileCategoryGrid({
  categories,
  loading,
  categoryImages,
}: {
  categories: MobileCategory[];
  loading: boolean;
  categoryImages?: Record<string, string>;
}) {
  const images = categoryImages || {};
  const [imageLoaded, setImageLoaded] = useState<Record<string, boolean>>({});
  const normalize = (value?: string) =>
    (value || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -240, behavior: 'smooth' });
    }
  };
  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 240, behavior: 'smooth' });
    }
  };
  return (
    <div className="md:hidden px-4 mb-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          
          <h3 className="text-lg font-semibold text-gray-900">Shop by category</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={scrollLeft}
            className="w-9 h-9 rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 flex items-center justify-center shadow-sm"
            aria-label="Scroll categories left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={scrollRight}
            className="w-9 h-9 rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 flex items-center justify-center shadow-sm"
            aria-label="Scroll categories right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
            {loading ? (
        <div className="flex gap-3 overflow-x-auto scrollbar-hidden pb-1" ref={scrollRef} aria-label="Loading categories">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={`cat-skeleton-${idx}`}
              className="group flex flex-col items-center min-w-[104px] max-w-[104px] text-center gap-2 animate-pulse"
            >
              <div className="relative w-24 h-24 rounded-full bg-emerald-50 border border-emerald-100 shadow-inner" />
              <div className="h-3 w-20 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="text-sm text-gray-500 py-2">Categories will appear here soon.</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto scrollbar-hidden pb-1" ref={scrollRef}>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={cat.handle ? `/c/${encodeURIComponent(cat.handle)}` : '#'}
              className="group flex flex-col items-center min-w-[118px] max-w-[118px] text-center"
            >
              {(() => {
                const slug = normalize(cat.handle) || normalize(cat.title);
                const mappedImage = categoryImageMap[slug] || categoryImageMap[cat.handle || ''];
                const tokens = slug.split('-').filter(Boolean);
                const keywordHit = categoryImageKeywords.find(({ includes }) =>
                  includes.every((kw) => tokens.some((t) => t.includes(kw)))
                );
                const displayImage =
                  mappedImage ||
                  (keywordHit ? keywordHit.image : undefined) ||
                  images[cat.id] ||
                  cat.image ||
                  '/oweg_logo.png';
                const loaded = imageLoaded[cat.id];
                return (
                  <div className="relative w-28 h-28 flex items-center justify-center overflow-hidden transition-transform duration-200 group-hover:-translate-y-1">
                    {!loaded && (
                      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-gray-100 via-white to-gray-100 animate-pulse" />
                    )}
                    {displayImage ? (
                      <Image
                        src={displayImage}
                        alt={cat.title}
                        fill
                        className="object-contain"
                        sizes="196px"
                        unoptimized
                        onLoadingComplete={() =>
                          setImageLoaded((prev) => ({ ...prev, [cat.id]: true }))
                        }
                        onLoad={() => setImageLoaded((prev) => ({ ...prev, [cat.id]: true }))}
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100 rounded-xl" />
                    )}
                  </div>
                );
              })()}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileJoinCard() {
  return (
    <div className="md:hidden px-4">
      <div className="rounded-2xl bg-gradient-to-r from-emerald-600 via-lime-500 to-emerald-500 text-white shadow-lg p-4 border border-white/20">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1">
            <p className="text-[11px] uppercase tracking-[0.28em] text-white/80">Join OWEG</p>
            <h3 className="text-xl font-semibold">Become a vendor or partner</h3>
            <p className="text-xs text-white/80">Set up your shop, earn as an agent, and manage orders from one place.</p>
          </div>
          <div className="rounded-full bg-white/15 p-3 shadow-inner">
            <Image src="/oweg_logo.png" alt="OWEG" width={42} height={42} className="object-contain" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Link
            href="/vendor-portal"
            className="text-sm font-semibold rounded-xl bg-white text-emerald-700 px-3 py-2 text-center shadow-sm hover:shadow transition"
          >
            Start as Vendor
          </Link>
          <a
            href="mailto:owegonline@oweg.in?subject=Join%20OWEG%20as%20Agent%20or%20Partner"
            className="text-sm font-semibold rounded-xl border border-white/70 text-white px-3 py-2 text-center hover:bg-white/10 transition"
          >
            Agent / Partner
          </a>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { customer } = useAuth();
  const { preferences, hasPreferences, loading: prefLoading, saving: prefSaving, shouldPrompt, savePreferences } = usePreferences();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [placeName, setPlaceName] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('oweg_pincode_place') || null;
  });
  const [placeLoading, setPlaceLoading] = useState(false);
  const [pincode, setPincode] = useState('');
  const [pinInput, setPinInput] = useState('');

  useEffect(() => {
    if (shouldPrompt) {
      setPreferencesOpen(true);
    }
  }, [shouldPrompt]);

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

  const showDefaultSections = !customer || !hasPreferences;

  const nonStickQuery = useQuery({
    queryKey: ['home-products', 'Non-Stick Cookwares'],
    queryFn: () => fetchProducts({ tag: 'Non-Stick Cookwares', limit: 40 }),
    staleTime: 1000 * 60 * 5,
    enabled: showDefaultSections,
  });
  const fanQuery = useQuery({
    queryKey: ['home-products', 'Fans'],
    queryFn: () => fetchProducts({ tag: 'Fans', limit: 40 }),
    staleTime: 1000 * 60 * 5,
    enabled: showDefaultSections,
  });
  const mensQuery = useQuery({
    queryKey: ['home-products', 'Mens Cloths'],
    queryFn: () => fetchProducts({ tag: 'Mens Cloths', limit: 20 }),
    staleTime: 1000 * 60 * 5,
    enabled: showDefaultSections,
  });
  const bagsQuery = useQuery({
    queryKey: ['home-products', 'Bags'],
    queryFn: () => fetchProducts({ tag: 'Bags', limit: 40 }),
    staleTime: 1000 * 60 * 5,
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

    return items.slice(0, 6);
  }, [customer, hasPreferences, preferences]);

  const personalizedQueries = useQueries({
    queries: personalizedSections.map((section) => ({
      queryKey: ['personalized-home', section.key, section.query],
      queryFn: () => fetchProducts(section.query, 32),
      enabled: Boolean(customer) && hasPreferences && personalizedSections.length > 0 && !prefLoading,
      staleTime: 1000 * 60 * 5,
      placeholderData: (prev: UIProduct[] | undefined) => prev,
    })),
  });
  const defaultSections = [
    {
      title: 'Non-Stick Cookwares',
      products: nonStickQuery.data ?? [],
      loading: nonStickQuery.isLoading,
      sourceTag: 'Non-Stick Cookwares',
      isPersonalized: false,
    },
    {
      title: 'Fans',
      products: fanQuery.data ?? [],
      loading: fanQuery.isLoading,
      sourceTag: 'Fans',
      isPersonalized: false,
    },
    {
      title: 'Mens Cloths',
      products: mensQuery.data ?? [],
      loading: mensQuery.isLoading,
      sourceTag: 'Mens Cloths',
      isPersonalized: false,
    },
  ];

  const personalizedSectionsData = personalizedSections.map((section, idx) => ({
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

  const sectionsToRender =
    showDefaultSections || personalizedSectionsData.length === 0 ? defaultSections : personalizedSectionsData;

  const categoriesQuery = useQuery({
    queryKey: ['home-categories'],
    queryFn: async () => {
      const res = await fetch('/api/medusa/categories', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Unable to load categories');
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });
  const categoriesData: MedusaCategory[] = useMemo(
    () =>
      Array.isArray(categoriesQuery.data?.categories)
        ? (categoriesQuery.data?.categories as MedusaCategory[])
        : [],
    [categoriesQuery.data?.categories]
  );

  const brandCollectionsQuery = useQuery({
    queryKey: ['home-brand-collections'],
    queryFn: async () => {
      const res = await fetch('/api/medusa/collections', { cache: 'no-store' });
      if (!res.ok) throw new Error('Unable to load brands');
      const data = await res.json();
      return (data.collections || []) as Array<{ id: string; title?: string; handle?: string }>;
    },
    staleTime: 1000 * 60 * 10,
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

    const result: MobileCategory[] = [];
    roots.forEach((node) => {
      if (!node) return;
      const id = (node.id || node.handle || node.title || node.name || Math.random().toString()).toString();
      if (seen.has(id)) return;
      seen.add(id);
      result.push({
        id,
        title: (node.title || node.name || 'Category').toString(),
        handle: node.handle || undefined,
        image:
          (node as MedusaCategory & { metadata?: { thumbnail?: string; image?: string } }).metadata?.thumbnail ||
          (node as MedusaCategory & { metadata?: { thumbnail?: string; image?: string } }).metadata?.image ||
          undefined,
      });
    });
    return result.sort((a, b) => a.title.localeCompare(b.title));
  }, [categoriesData]);

  const categorySuggestions = useMemo(
    () => mobileCategories.slice(0, 12).map((cat) => cat.title),
    [mobileCategories]
  );

  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
  const categoryImagesRef = useRef<Record<string, string>>({});
  useEffect(() => {
    categoryImagesRef.current = categoryImages;
  }, [categoryImages]);

  useEffect(() => {
    let cancelled = false;
    const targets = mobileCategories
      .filter((cat) => cat?.id && !categoryImagesRef.current[cat.id])
      .slice(0, Math.min(16, mobileCategories.length));
    const fetchThumbs = async () => {
      const entries = await Promise.all(
        targets.map(async (cat) => {
          if (!cat?.id) return null;
          try {
            const query =
              cat.handle && cat.handle.length > 0
                ? `category=${encodeURIComponent(cat.handle)}`
                : cat.id
                  ? `categoryId=${encodeURIComponent(cat.id)}`
                  : '';
            if (!query) return null;
            const res = await fetch(`/api/medusa/products?${query}&limit=1`, { cache: 'no-store' });
            if (!res.ok) return null;
            const data = await res.json();
            const prod = Array.isArray(data?.products) ? data.products[0] : null;
            const thumb = prod?.thumbnail || prod?.image || (Array.isArray(prod?.images) ? prod.images[0]?.url : undefined);
            if (thumb) return [cat.id, thumb] as const;
          } catch {
            // ignore errors, fallback to default
          }
          return null;
        })
      );
      if (cancelled) return;
      setCategoryImages((prev) => {
        const next = { ...prev };
        entries.forEach((pair) => {
          if (pair) {
            const [id, img] = pair;
            if (!next[id]) next[id] = img;
          }
        });
        categoryImagesRef.current = next;
        return next;
      });
    };
    fetchThumbs();
    return () => {
      cancelled = true;
    };
  }, [mobileCategories]);
  const loading =
    sectionsToRender.some((section) => section.loading) ||
    bagsQuery.isLoading;
  const defaultProductsError = nonStickQuery.error || fanQuery.error || mensQuery.error;
  const personalizedError = personalizedQueries.find((q) => q?.error)?.error;
  const errorMessage = showDefaultSections
    ? defaultProductsError instanceof Error
      ? defaultProductsError.message
      : defaultProductsError
        ? 'Unable to load products'
        : null
      : personalizedError instanceof Error
        ? personalizedError.message
        : personalizedError
          ? 'Unable to load your picks'
          : null;
  const additionalError = bagsQuery.error;
  const displayError = errorMessage || (additionalError ? 'Unable to load featured items' : null);

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
      const res = await fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(pin)}`);
      if (!res.ok) return null;
      const data = await res.json();
      const office = Array.isArray(data) ? data[0]?.PostOffice?.[0] : null;
      const name = office?.Name;
      const district = office?.District;
      const state = office?.State;
      const place = [name, district, state].filter(Boolean).join(', ');
      return place || null;
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
      {/* Global CSS injected here to ensure .scrollbar-hidden actually hides scrollbars across browsers.
          You can move this to src/app/globals.css if you prefer a central stylesheet. */}
      <style jsx global>{`
        /* hide scrollbar for elements with .scrollbar-hidden */
        .scrollbar-hidden {
          -ms-overflow-style: none; /* IE and Edge */
          scrollbar-width: none; /* Firefox */
        }
        .scrollbar-hidden::-webkit-scrollbar {
          display: none; /* Chrome, Safari, Opera */
          width: 0;
          height: 0;
        }

        /* optional: ensure horizontal scroll area uses touch scrolling smoothly on iOS */
        .scrollbar-hidden {
          -webkit-overflow-scrolling: touch;
        }
      `}</style>

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

        <MobileCategoryGrid
          categories={mobileCategories}
          loading={categoriesQuery.isLoading}
          categoryImages={categoryImages}
        />
        <div className="md:hidden px-4 mb-6 space-y-4">
          {MOBILE_TOP_BANNERS.map((banner) => (
            <MobileBanner
              key={banner.src}
              src={banner.src}
              href={banner.href}
              alt={banner.alt}
              unoptimized
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
          <div key={`${section.title}-${idx}`}>
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
            {section.title === 'Fans' && (
              <div className="md:hidden px-4 mb-4 space-y-4">
                <MobileBanner src="/App_Banner-5.png" href="/c/home-appliances" alt="Shop home appliances" />
                <MobileBanner src="/App_Banner-6.png" href="/c/ceiling-fans" alt="Shop ceiling fans" />
              </div>
            )}
            {section.title === 'Mens Cloths' && (
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
                <Image src={banner.image} alt={banner.alt} fill className="object-container" unoptimized />
              </Link>
            ))}
          </div>
          <ProductCarousel
            title="Bags"
            products={bagsQuery.data ?? []}
            sourceTag="Bags"
            loading={bagsQuery.isLoading}
            paddingClass="px-2 md:px-4"
          />
        </div>
        <div className="px-4 mt-10">
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Top brands we carry</h1>
              </div>
              {brandCollectionsQuery.isLoading && (
                <div className="inline-flex items-center gap-2 text-sm text-emerald-700">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading
                </div>
              )}
            </div>
            <div className="flex gap-4 overflow-x-auto scrollbar-hidden pb-3">
              {brandCollectionsQuery.isLoading
                ? Array.from({ length: 8 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="min-w-[170px] h-24 rounded-2xl border border-gray-100 bg-gray-50 animate-pulse"
                    />
                  ))
                : brandCollections.map((brand) => {
                    const logo = getBrandLogoPath(brand.title, brand.handle);
                    const scale = getBrandLogoScale(brand.title, brand.handle);
                    const slug = brand.handle || normalizeBrandKey(brand.title) || brand.id;
                    return (
                      <Link
                        key={brand.id}
                        href={`/brands/${encodeURIComponent(slug)}?from=home`}
                        className="group min-w-[170px] h-24 rounded-2xl border border-gray-100 bg-white shadow-sm flex items-center justify-center px-4 hover:-translate-y-1 transition hover:shadow-[0_15px_36px_-24px_rgba(0,0,0,0.35)]"
                      >
                        <Image
                          src={logo}
                          alt={brand.title || 'Brand logo'}
                          width={160}
                          height={80}
                          className="object-contain"
                          style={{ transform: `scale(${scale})` }}
                          unoptimized
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (img.src.includes('oweg_logo')) return;
                            img.src = '/oweg_logo.png';
                          }}
                        />
                      </Link>
                    );
                  })}
            </div>
          </div>
        </div>
        <div className="md:hidden px-4 mb-8">
          <MobileBanner src="/App_Banner-9.png" href="/c/kitchen-appliances" alt="Shop kitchen appliances" />
        </div>
        <MobileJoinCard />
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

