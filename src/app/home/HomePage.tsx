'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';


// Mock data for products
const nonStickCookwares = [
  { id: 1, name: '2 Layer Electric Lunch Box for Office, Portable Lunch Warmer...', price: 949, mrp: 1499, discount: 37, image: 'https://images.unsplash.com/photo-1584990347449-39b4aa02d0f7?w=400&h=400&fit=crop', limitedDeal: true },
  { id: 2, name: '24 Energy High Quality Mosquito Bat With Led Light...', price: 350, mrp: 699, discount: 50, image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=400&fit=crop', limitedDeal: true },
  { id: 3, name: '3D Crystal Ball Night Light Mix Design', price: 390, mrp: 590, discount: 34, image: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=400&h=400&fit=crop', limitedDeal: true },
  { id: 4, name: '24 Energy Rechargeable 18 Hi-Bright Led Tube Electric...', price: 450, mrp: 900, discount: 50, image: 'https://images.unsplash.com/photo-1565183928294-7d22f2d8d78e?w=400&h=400&fit=crop', limitedDeal: true },
  { id: 5, name: '24 Energy Rechargeable 18 Hi-Bright Led Tube Electric...', price: 450, mrp: 900, discount: 50, image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=400&fit=crop', limitedDeal: true },
];

const fans = [
  { id: 1, name: '2 Layer Electric Lunch Box for Office, Portable Lunch Warmer...', price: 949, mrp: 1499, discount: 37, image: 'https://images.unsplash.com/photo-1622122201714-77da0ca8e5d2?w=400&h=400&fit=crop', limitedDeal: true },
  { id: 2, name: '24 Energy High Quality Mosquito Bat With Led Light...', price: 350, mrp: 699, discount: 50, image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop', limitedDeal: true },
  { id: 3, name: '3D Crystal Ball Night Light Mix Design', price: 390, mrp: 590, discount: 34, image: 'https://images.unsplash.com/photo-1622122201714-77da0ca8e5d2?w=400&h=400&fit=crop', limitedDeal: true },
  { id: 4, name: '24 Energy Rechargeable 18 Hi-Bright Led Tube Electric...', price: 450, mrp: 900, discount: 50, image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop', limitedDeal: true },
  { id: 5, name: '24 Energy Rechargeable 18 Hi-Bright Led Tube Electric...', price: 450, mrp: 900, discount: 50, image: 'https://images.unsplash.com/photo-1622122201714-77da0ca8e5d2?w=400&h=400&fit=crop', limitedDeal: true },
];

const mensClothes = [
  { id: 1, name: 'Mens Slim Fit Jeans', price: 949, mrp: 1499, discount: 37, image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=400&fit=crop', limitedDeal: true },
  { id: 2, name: 'Mens Casual Trousers', price: 350, mrp: 699, discount: 50, image: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400&h=400&fit=crop', limitedDeal: true },
  { id: 3, name: 'Mens Denim Jeans', price: 390, mrp: 590, discount: 34, image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=400&fit=crop', limitedDeal: true },
  { id: 4, name: 'Mens Cargo Pants', price: 450, mrp: 900, discount: 50, image: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400&h=400&fit=crop', limitedDeal: true },
  { id: 5, name: 'Mens Chino Pants', price: 450, mrp: 900, discount: 50, image: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400&h=400&fit=crop', limitedDeal: true },
];


// Product Card Component
function ProductCard({ product }: { product: typeof nonStickCookwares[0] }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className="flex-shrink-0 w-[300px] bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative aspect-square bg-gray-100 overflow-hidden">
        <Image
          src={product.image}
          alt={product.name}
          fill
          className={`object-cover transition-transform duration-500 ${isHovered ? 'scale-110' : 'scale-100'}`}
          sizes="200px"
        />
        <button className={`absolute bottom-2 right-2 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white hover:bg-green-600 transition-all duration-300 hover:scale-110 hover:rotate-90 ${isHovered ? 'opacity-100' : 'opacity-80'}`}>
          <span className="text-xl leading-none">+</span>
        </button>
      </div>
      <div className="p-3">
        <div className="flex items-start gap-2 mb-2">
          <span className="bg-red-600 text-white text-xs font-semibold px-2 py-0.5 rounded animate-pulse">
            {product.discount}% off
          </span>
          {product.limitedDeal && (
            <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded">
              Limited time deal
            </span>
          )}
        </div>
        <div className="mb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-gray-900">₹{product.price}</span>
            <span className="text-sm text-gray-500 line-through">M.R.P: ₹{product.mrp}</span>
          </div>
        </div>
        <p className="text-sm text-gray-700 line-clamp-2">{product.name}</p>
      </div>
    </div>
  );
}

// Product Carousel Component
function ProductCarousel({ title, products }: { title: string; products: typeof nonStickCookwares }) {
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
        className="flex gap-4 overflow-x-auto scrollbar-hidden pb-4 -mx-4 px-4 scroll-smooth"
      >
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
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

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isHovered) return; // pause while hovered
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 2000); // ~1s per image
    return () => clearInterval(timer);
  }, [isHovered]);

  const prev = () =>
    setCurrentSlide((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  const next = () =>
    setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);

  return (
    <div
      className={`relative w-full h-[400px] rounded-lg overflow-hidden mb-8 transition-all duration-1000 ${
        isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="absolute inset-0 flex items-center justify-between px-4 sm:px-8 z-10">
        <button
          onClick={prev}
          className="w-10 h-10 sm:w-12 sm:h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white hover:scale-110 transition-all duration-300"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
        </button>
        <button
          onClick={next}
          className="w-10 h-10 sm:w-12 sm:h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white hover:scale-110 transition-all duration-300"
          aria-label="Next slide"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
        </button>
      </div>
      <div className="relative w-full h-full">
        {HERO_SLIDES.map((src, idx) => (
          <Image
            key={src}
            src={src}
            alt={`Hero banner ${idx + 1}`}
            fill
            priority={idx === 0}
            className={`object-cover absolute inset-0 transition-opacity duration-700 ${
              idx === currentSlide ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}
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

// Header Component


export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-8xl mx-auto py-6">
        <div className="px-4">
          <HeroBanner />
        </div>
        <ProductCarousel title="Non-Stick Cookwares" products={nonStickCookwares} />
        <ProductCarousel title="Fans" products={fans} />
        <div className="px-4">
          <PromoBanners />
        </div>
        
        <ProductCarousel title="Mens Cloths" products={mensClothes} />

        
        
      </main>
    </div>
  );
}
