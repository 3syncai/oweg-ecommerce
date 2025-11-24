'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ProductCard } from '@/components/modules/ProductCard';

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

// ProductCard is now imported from shared component

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
        className="flex gap-4 overflow-x-auto scrollbar-hidden pb-4 scroll-smooth snap-x snap-mandatory"
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

export default function HomePage() {
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
  const loading = nonStickQuery.isLoading || fanQuery.isLoading || mensQuery.isLoading;
  const productsError = nonStickQuery.error || fanQuery.error || mensQuery.error;
  const errorMessage =
    productsError instanceof Error ? productsError.message : productsError ? 'Unable to load products' : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-8xl mx-auto py-6">
        <div className="px-4">
          <HeroBanner />
        </div>
        <ProductCarousel title="Non-Stick Cookwares" products={nonStick} sourceTag="Non-Stick Cookwares" />
        <ProductCarousel title="Fans" products={fanProducts} sourceTag="Fans" />
        <div className="px-4">
          <PromoBanners />
        </div>
        <ProductCarousel title="Mens Cloths" products={mensCloth} sourceTag="Mens Cloths" />
        {loading && <div className="px-4 text-sm text-gray-500">Loading products from store...</div>}
        {!loading && errorMessage && <div className="px-4 text-sm text-red-500">{errorMessage}</div>}
      </main>
    </div>
  );
}

