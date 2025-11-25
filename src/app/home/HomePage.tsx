'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, MapPin, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ProductCard } from '@/components/modules/ProductCard';
import type { MedusaCategory } from '@/lib/medusa';
import { useAuth } from '@/contexts/AuthProvider';

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

async function fetchProductsByTag(tag: string, limit: number): Promise<UIProduct[]> {
  const url = `/api/medusa/products?tag=${encodeURIComponent(tag)}&limit=${limit}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Unable to load products for ${tag}`);
  }
  const data = await res.json();
  return (data?.products || []) as UIProduct[];
}

// Product Carousel Component
function ProductCarousel({ title, products, sourceTag }: { title: string; products: UIProduct[]; sourceTag?: string }) {
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

  return (
    <div className="mb-8 px-4">
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
        {products.map((product) => (
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
  '/HeroBaneer_1.png',
  '/HeroBaneer_2.png',
  '/HeroBaneer_3.png',
  '/HeroBaneer_4.png',
  '/HeroBaneer_5.png',
  '/HeroBaneer_6.png',
  '/HeroBaneer_7.png',
  '/HeroBaneer_8.png',
  '/HeroBaneer_9.png',
  '/HeroBaneer_10.png',
  '/HeroBaneer_11.png',
  '/HeroBaneer_12.png',
  '/Banner.png',
  '/HeroBaneer_13.png',
];

function HeroBanner() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDelta, setTouchDelta] = useState(0);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

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
    <div
      className={`relative w-full h-[320px] md:h-[400px] rounded-2xl overflow-hidden mb-8 transition-all duration-700 ${
        isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="absolute inset-0 flex items-center justify-between px-3 sm:px-6 z-10 pointer-events-none md:pointer-events-auto">
        <button
          onClick={prev}
          className="w-9 h-9 sm:w-12 sm:h-12 bg-white/85 backdrop-blur-sm rounded-full hidden md:flex items-center justify-center shadow-lg hover:bg-white hover:scale-110 transition-all duration-300"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
        </button>
        <button
          onClick={next}
          className="w-9 h-9 sm:w-12 sm:h-12 bg-white/85 backdrop-blur-sm rounded-full hidden md:flex items-center justify-center shadow-lg hover:bg-white hover:scale-110 transition-all duration-300"
          aria-label="Next slide"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
        </button>
      </div>
      <div className="relative w-full h-full min-h-[320px] sm:min-h-[360px]">
        {HERO_SLIDES.map((src, idx) => (
          <div
            key={src}
            className={`absolute inset-0 transition-opacity duration-700 ${
              idx === currentSlide ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={idx !== currentSlide}
          >
            <Image
              src={src}
              alt={`Hero banner ${idx + 1}`}
              fill
              priority={idx === 0}
              className="object-container object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent md:from-black/30 md:via-black/10 md:to-transparent" />
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
  );
}

// Promo Banners Component
function PromoBanners() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const banners = [
    {
      title: 'INNOVATIVE',
      subtitle: 'EASY TO USE INDUCTION',
      bgGradient: 'from-blue-100 to-blue-200',
      textColor: 'text-blue-900',
      subtitleColor: 'text-blue-700',
      buttonColor: 'bg-blue-600 hover:bg-blue-700',
      image: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=300&h=200&fit=crop',
      alt: 'Induction cooktop',
    },
    {
      title: 'IRONING',
      subtitle: 'As Good As New',
      bgGradient: 'from-purple-100 to-purple-200',
      textColor: 'text-purple-900',
      subtitleColor: 'text-purple-700',
      buttonColor: 'bg-purple-600 hover:bg-purple-700',
      image: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=300&h=200&fit=crop',
      alt: 'Iron',
    },
    {
      title: 'GLASS',
      subtitle: 'COOKTOP',
      bgGradient: 'from-gray-100 to-gray-200',
      textColor: 'text-gray-900',
      subtitleColor: 'text-gray-700',
      buttonColor: 'bg-gray-800 hover:bg-gray-900',
      image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=300&h=200&fit=crop',
      alt: 'Glass cooktop',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {banners.map((banner, index) => (
        <div
          key={index}
          className={`relative h-48 bg-gradient-to-br ${banner.bgGradient} rounded-lg overflow-hidden transition-all duration-500 hover:shadow-xl hover:-translate-y-2 cursor-pointer`}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 z-10">
            <h3 className={`text-2xl font-bold ${banner.textColor} mb-2 transition-transform duration-300 ${hoveredIndex === index ? 'scale-110' : 'scale-100'}`}>
              {banner.title}
            </h3>
            <p className={`text-sm ${banner.subtitleColor} mb-3`}>{banner.subtitle}</p>
            <button className={`${banner.buttonColor} text-white px-6 py-2 rounded-full font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg`}>
              SHOP NOW
            </button>
          </div>
          <Image
            src={banner.image}
            alt={banner.alt}
            fill
            className={`object-cover transition-all duration-500 ${hoveredIndex === index ? 'opacity-40 scale-110' : 'opacity-30 scale-100'}`}
          />
        </div>
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
        <div className="text-sm text-gray-500 py-2">Loading categories…</div>
      ) : categories.length === 0 ? (
        <div className="text-sm text-gray-500 py-2">Categories will appear here soon.</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto scrollbar-hidden pb-1" ref={scrollRef}>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={cat.handle ? `/c/${encodeURIComponent(cat.handle)}` : '#'}
              className="group flex flex-col items-center min-w-[104px] max-w-[104px] text-center gap-2"
            >
              <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-50 via-white to-lime-50 border border-emerald-200 shadow-sm flex items-center justify-center overflow-hidden transition-transform duration-200 group-hover:-translate-y-1"
                style={{ boxShadow: '0 0 0 2px rgba(122,201,67,0.16), 0 8px 20px -10px rgba(0,0,0,0.2)' }}>
                {images[cat.id] || cat.image ? (
                  <Image
                    src={images[cat.id] || cat.image || '/oweg_logo.png'}
                    alt={cat.title}
                    fill
                    className="object-contain p-2"
                    sizes="96px"
                  />
                ) : (
                  <span className="text-[11px] font-semibold text-emerald-700 px-2 leading-tight line-clamp-2">
                    {cat.title.slice(0, 12)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-800 leading-tight line-clamp-2">{cat.title}</p>
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
  const nonStickQuery = useQuery({
    queryKey: ['home-products', 'Non-Stick Cookwares'],
    queryFn: () => fetchProductsByTag('Non-Stick Cookwares', 40),
    staleTime: 1000 * 60 * 5,
  });
  const fanQuery = useQuery({
    queryKey: ['home-products', 'Fans'],
    queryFn: () => fetchProductsByTag('Fans', 40),
    staleTime: 1000 * 60 * 5,
  });
  const mensQuery = useQuery({
    queryKey: ['home-products', 'Mens Cloths'],
    queryFn: () => fetchProductsByTag('Mens Cloths', 20),
    staleTime: 1000 * 60 * 5,
  });

  const nonStick = nonStickQuery.data ?? [];
  const fanProducts = fanQuery.data ?? [];
  const mensCloth = mensQuery.data ?? [];
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
  const categoriesData: MedusaCategory[] = Array.isArray(categoriesQuery.data?.categories)
    ? (categoriesQuery.data?.categories as MedusaCategory[])
    : [];

  const mobileCategories: MobileCategory[] = useMemo(() => {
    const seen = new Set<string>();
    const result: MobileCategory[] = [];

    const addNode = (node: MedusaCategory | undefined) => {
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
      const children = Array.isArray(node.category_children) ? node.category_children : [];
      children.forEach((child) => addNode(child));
    };

    categoriesData.forEach((cat) => addNode(cat));
    return result.sort((a, b) => a.title.localeCompare(b.title));
  }, [categoriesData]);

  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
  const categoryImagesRef = useRef<Record<string, string>>({});
  const [pinInput, setPinInput] = useState('');
  const [pincode, setPincode] = useState('');

  useEffect(() => {
    categoryImagesRef.current = categoryImages;
  }, [categoryImages]);

  useEffect(() => {
    let cancelled = false;
    const targets = mobileCategories
      .filter((cat) => cat?.id && !categoryImagesRef.current[cat.id])
      .slice(0, 32);
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
  const loading = nonStickQuery.isLoading || fanQuery.isLoading || mensQuery.isLoading;
  const productsError = nonStickQuery.error || fanQuery.error || mensQuery.error;
  const errorMessage =
    productsError instanceof Error ? productsError.message : productsError ? 'Unable to load products' : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('oweg_pincode');
    if (stored) {
      setPincode(stored);
      setPinInput(stored);
    }
  }, []);

  const handlePinSubmit = () => {
    const trimmed = pinInput.trim();
    if (!trimmed) return;
    setPincode(trimmed);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('oweg_pincode', trimmed);
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

      <main className="max-w-8xl mx-auto pb-6 md:pt-6 md:pb-6">
        {!customer && !pincode && (
          <div className="md:hidden px-4 mb-3 space-y-2">
            <p className="text-sm font-semibold text-emerald-800 leading-tight">Share pincode for faster delivery by local sellers</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Enter Pincode"
                  className="w-full h-9 rounded-lg border border-[#7AC943] bg-white px-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
                <MapPin className="w-4 h-4 text-[#7AC943] absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
              <button
                type="button"
                onClick={handlePinSubmit}
                className="h-9 px-4 rounded-lg bg-[#7AC943] text-white text-sm font-semibold shadow-sm hover:bg-emerald-700"
              >
                Submit
              </button>
            </div>
          </div>
        )}
        {!customer && (
          <div className="md:hidden px-4 mb-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-[#7AC943] flex items-center justify-center">
              <User className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <p className="text-base font-semibold text-emerald-800 leading-tight">You are missing out</p>
              <p className="text-sm text-[#7AC943]">Sign in for the best offers</p>
            </div>
            <Link
              href="/login"
              className="rounded-lg bg-[#7AC943] text-white text-sm font-semibold px-3 py-2 shadow hover:bg-emerald-700"
            >
              SIGN IN
            </Link>
          </div>
        )}
        <MobileCategoryGrid
          categories={mobileCategories}
          loading={categoriesQuery.isLoading}
          categoryImages={categoryImages}
        />
        <div className="md:hidden px-4 mb-6 space-y-4">
          {['/App_Banner-1.jpg', '/App_Banner-2.jpg', '/App_Banner-3.jpg'].map((src, idx) => (
            <div key={src} className="relative w-full h-44 overflow-hidden  shadow-sm border border-gray-100">
              <Image
                src={src}
                alt="App promo banner"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 0px"
                loading="eager"
                fetchPriority="high"
                priority={idx === 0}
              />
            </div>
          ))}
        </div>
        <div className="px-4">
          <div className="hidden md:block">
            <HeroBanner />
          </div>
        </div>
        <ProductCarousel title="Non-Stick Cookwares" products={nonStick} sourceTag="Non-Stick Cookwares" />
        <ProductCarousel title="Fans" products={fanProducts} sourceTag="Fans" />
        <div className="px-4">
          <PromoBanners />
        </div>
        <ProductCarousel title="Mens Cloths" products={mensCloth} sourceTag="Mens Cloths" />
        <MobileJoinCard />
        {loading && <div className="px-4 text-sm text-gray-500">Loading products from store...</div>}
        {!loading && errorMessage && <div className="px-4 text-sm text-red-500">{errorMessage}</div>}
      </main>
    </div>
  );
}
