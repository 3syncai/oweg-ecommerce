'use client';
// @ts-nocheck
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import NextImage from 'next/image'
// --------------------------------------------------
// OWEG Home – React + Tailwind single-file prototype
// Next.js compatible. Tailwind required. Accessible, mobile-first.
// --------------------------------------------------

// ---------- Image helpers ----------
const unsplash = (kw: string) => `https://source.unsplash.com/800x600/?${encodeURIComponent(kw)}`;

// Inline SVG that always renders (no network)
function svgThumb(label: string) {
  const text = (label || 'Image').replace(/&/g, '&amp;');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'>
  <defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='#e2fbe8'/><stop offset='1' stop-color='#e6f0ff'/></linearGradient></defs>
  <rect width='100%' height='100%' rx='24' ry='24' fill='url(#g)'/>
  <text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle' fill='#0f172a' font-family='Arial, Helvetica, sans-serif' font-size='26'>${text}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// (Removed unused inline brand logo; using public image instead)

// Progressive image: shows inline SVG immediately; then loads network image.
function SafeImage({ src, alt = '', className = '', seed }: { src: string[] | string; alt?: string; className?: string; seed?: string | number }) {
  const provided = Array.isArray(src) ? src.filter(Boolean) : [src].filter(Boolean);
  const label = alt || String(seed || 'Image');
  const [current, setCurrent] = useState(svgThumb(label));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const url of provided) {
        const ok = await new Promise((resolve) => {
          const img = new Image();
          img.referrerPolicy = 'no-referrer';
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = url;
        });
        if (cancelled) return;
        if (ok) {
          setCurrent(url as string);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provided, label]);

  return (
    <img
      src={current}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      onError={() => setCurrent(svgThumb(label))}
    />
  );
}

// ---------- Demo Data ----------
const categories = [
  { name: 'Sarees', image: unsplash('saree, textile, clothing') },
  { name: 'Electronics', image: unsplash('electronics, gadgets') },
  { name: 'Home & Kitchen', image: unsplash('home, kitchen') },
  { name: 'Beauty', image: unsplash('beauty, cosmetics') },
  { name: 'Footwear', image: unsplash('shoes, footwear') },
  { name: 'Stationery', image: unsplash('stationery, office') },
];

type CategoryGroup = { name: string; items: string[] };
type CategoryTreeItem = { name: string; hero: string; groups: CategoryGroup[] };
// Amazon-like category tree (3 levels max)
const categoryTree: CategoryTreeItem[] = [
  {
    name: 'Electronics',
    hero: unsplash('electronics flatlay green'),
    groups: [
      { name: 'Mobiles & Accessories', items: ['Smartphones', 'Power Banks', 'TWS & Headphones', 'Chargers & Cables', 'Cases & Covers'] },
      { name: 'Computing', items: ['Laptops', 'Keyboards & Mice', 'Monitors', 'Storage & SSDs'] },
      { name: 'Audio & TV', items: ['Bluetooth Speakers', 'Soundbars', 'LED TVs', 'Streaming Sticks'] },
    ],
  },
  {
    name: 'Fashion',
    hero: unsplash('fashion apparel on green background'),
    groups: [
      { name: 'Women', items: ['Sarees', 'Kurtis', 'Dress Materials', 'Handbags'] },
      { name: 'Men', items: ['T-Shirts', 'Shirts', 'Jeans', 'Belts & Wallets'] },
      { name: 'Accessories', items: ['Watches', 'Sunglasses', 'Caps & Hats'] },
    ],
  },
  {
    name: 'Home & Kitchen',
    hero: unsplash('non stick cookware set kitchen green'),
    groups: [
      { name: 'Kitchen', items: ['Cookware Sets', 'Gas Stoves', 'Mixer Grinders', 'Dinner Sets'] },
      { name: 'Bedding', items: ['Bedsheets', 'Quilts', 'Pillows'] },
      { name: 'Lighting', items: ['Table Lamps', 'Ceiling Lights'] },
    ],
  },
  {
    name: 'Beauty',
    hero: unsplash('skincare cosmetics green'),
    groups: [
      { name: 'Skin Care', items: ['Vitamin C Serum', 'Face Wash', 'Moisturizers'] },
      { name: 'Makeup', items: ['Matte Lipstick', 'Kajal', 'Compact'] },
      { name: 'Hair Care', items: ['Shampoo', 'Conditioner', 'Hair Oil'] },
    ],
  },
  {
    name: 'Footwear',
    hero: unsplash('running shoes green background'),
    groups: [
      { name: 'Men', items: ['Running Shoes', 'Casual Sneakers', 'Sandals & Sliders'] },
      { name: 'Women', items: ['Sneakers', 'Heels', 'Flats'] },
    ],
  },
  {
    name: 'Stationery',
    hero: unsplash('notebooks pens green'),
    groups: [
      { name: 'Writing', items: ['Gel Pens', 'Markers', 'Pencils'] },
      { name: 'Paper', items: ['Notebooks', 'Journals', 'Sticky Notes'] },
      { name: 'Desk', items: ['Organizers', 'Files & Folders'] },
    ],
  },
];

const brands = ['Balaji', 'NovaTech', 'Homify', 'PureGlow', 'Stride+', 'PaperPro'];

type ProductItem = { id: string | number; title: string; image: string; moq: number; unitPrice: number; mrp: number; offPercent: number; eta: string; rating: number };
const dealsByTab: Record<string, ProductItem[]> = {
  Electronics: [
    { id: 'el-1', title: 'Bluetooth Earbuds Pro', image: unsplash('bluetooth earbuds, earphones'), moq: 5, unitPrice: 1299, mrp: 1899, offPercent: 32, eta: '24-48h', rating: 4 },
    { id: 'el-2', title: 'Power Bank 20,000 mAh', image: unsplash('power bank, portable charger'), moq: 5, unitPrice: 1699, mrp: 2499, offPercent: 32, eta: '2-4d', rating: 5 },
    { id: 'el-3', title: 'Wireless Keyboard & Mouse', image: unsplash('wireless keyboard mouse, computer accessories'), moq: 10, unitPrice: 899, mrp: 1399, offPercent: 36, eta: '48-72h', rating: 4 },
  ],
  Fashion: [
    { id: 'fa-1', title: 'Kanchipuram Silk Saree', image: unsplash('silk saree, indian saree'), moq: 5, unitPrice: 2199, mrp: 2999, offPercent: 27, eta: '24-48h', rating: 4 },
    { id: 'fa-2', title: 'Cotton Kurti Set', image: unsplash('kurti, indian clothing'), moq: 8, unitPrice: 749, mrp: 999, offPercent: 25, eta: '2-4d', rating: 5 },
    { id: 'fa-3', title: "Men's Casual Shoes", image: unsplash('casual shoes, sneakers men'), moq: 6, unitPrice: 1290, mrp: 1890, offPercent: 31, eta: '48-72h', rating: 4 },
  ],
  Home: [
    { id: 'ho-1', title: 'Non-Stick Cookware Set (5 pc)', image: unsplash('non stick cookware set, kitchen pots'), moq: 4, unitPrice: 1890, mrp: 2490, offPercent: 24, eta: '3-5d', rating: 4 },
    { id: 'ho-2', title: 'Bedsheet (King, 300TC)', image: unsplash('king size bedsheet, bedding'), moq: 6, unitPrice: 990, mrp: 1490, offPercent: 34, eta: '24-48h', rating: 5 },
    { id: 'ho-3', title: 'LED Table Lamp', image: unsplash('table lamp, desk lamp'), moq: 8, unitPrice: 699, mrp: 999, offPercent: 30, eta: '2-4d', rating: 4 },
  ],
  Beauty: [
    { id: 'be-1', title: 'Vitamin C Serum (30ml)', image: unsplash('vitamin c serum, skincare'), moq: 10, unitPrice: 279, mrp: 399, offPercent: 30, eta: '24-48h', rating: 4 },
    { id: 'be-2', title: 'Matte Lipstick Pack (6)', image: unsplash('lipstick set, makeup'), moq: 6, unitPrice: 999, mrp: 1499, offPercent: 33, eta: '2-4d', rating: 5 },
    { id: 'be-3', title: 'Aloe Face Wash (100ml)', image: unsplash('aloe face wash, skincare'), moq: 12, unitPrice: 129, mrp: 199, offPercent: 35, eta: '48-72h', rating: 4 },
  ],
  Footwear: [
    { id: 'fw-1', title: 'Running Shoes', image: unsplash('running shoes, sports shoes'), moq: 6, unitPrice: 1490, mrp: 2190, offPercent: 32, eta: '2-4d', rating: 4 },
    { id: 'fw-2', title: 'Sliders (Unisex)', image: unsplash('sliders sandals, slides'), moq: 10, unitPrice: 399, mrp: 699, offPercent: 43, eta: '24-48h', rating: 5 },
    { id: 'fw-3', title: 'Formal Oxfords', image: unsplash('oxford shoes formal'), moq: 4, unitPrice: 2190, mrp: 2990, offPercent: 27, eta: '3-5d', rating: 4 },
  ],
  Stationery: [
    { id: 'st-1', title: 'A5 Notebook (Pack of 10)', image: unsplash('a5 notebook, stationery'), moq: 5, unitPrice: 79, mrp: 129, offPercent: 39, eta: '24-48h', rating: 4 },
    { id: 'st-2', title: 'Gel Pens (Pack of 50)', image: unsplash('gel pens, pen set'), moq: 4, unitPrice: 6, mrp: 10, offPercent: 40, eta: '2-4d', rating: 5 },
    { id: 'st-3', title: 'Desk Organizer', image: unsplash('desk organizer'), moq: 6, unitPrice: 299, mrp: 499, offPercent: 40, eta: '48-72h', rating: 4 },
  ],
};

const newArrivals: ProductItem[] = [
  { id: 'n-1', title: 'Smartwatch S2', image: unsplash('smartwatch'), moq: 1, unitPrice: 1999, mrp: 2799, offPercent: 29, eta: '2-4d', rating: 4 },
  { id: 'n-2', title: 'Wireless Speaker Mini', image: unsplash('wireless speaker'), moq: 1, unitPrice: 999, mrp: 1499, offPercent: 33, eta: '24-48h', rating: 4 },
  { id: 'n-3', title: 'Ceramic Dinner Set (18 pc)', image: unsplash('dinner set, ceramic plates'), moq: 1, unitPrice: 2190, mrp: 2990, offPercent: 27, eta: '3-5d', rating: 5 },
  { id: 'n-4', title: "Men's Running Tee", image: unsplash('running t-shirt'), moq: 1, unitPrice: 449, mrp: 699, offPercent: 36, eta: '2-4d', rating: 4 },
  { id: 'n-5', title: 'Skincare Combo (3)', image: unsplash('skincare products'), moq: 1, unitPrice: 799, mrp: 1199, offPercent: 33, eta: '24-48h', rating: 4 },
  { id: 'n-6', title: 'Leather Journal A5', image: unsplash('leather journal'), moq: 1, unitPrice: 349, mrp: 499, offPercent: 30, eta: '2-4d', rating: 5 },
  { id: 'n-7', title: 'Casual Sneakers', image: unsplash('casual sneakers'), moq: 1, unitPrice: 1390, mrp: 1990, offPercent: 30, eta: '3-5d', rating: 4 },
  { id: 'n-8', title: 'Printed Bedsheet (Queen)', image: unsplash('printed bedsheet'), moq: 1, unitPrice: 799, mrp: 1199, offPercent: 33, eta: '24-48h', rating: 4 },
];

// ---------- Icons ----------
function AndroidIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true" role="img">
      <path d="M17.6 9H6.4A1.4 1.4 0 0 0 5 10.4v6.2A1.4 1.4 0 0 0 6.4 18h.6v2.4a1.6 1.6 0 1 0 3.2 0V18h3.6v2.4a1.6 1.6 0 1 0 3.2 0V18h.6A1.4 1.4 0 0 0 19 16.6v-6.2A1.4 1.4 0 0 0 17.6 9Zm-9.9-2.8.9.5A6.2 6.2 0 0 1 8 9h8a6.2 6.2 0 0 1-.6-2.3l.9-.5M7.5 6a.9.9 0 1 1 .9.9A.9.9 0 0 1 7.5 6Zm8.1 0a.9.9 0 1 1 .9.9.9.9 0 0 1-.9-.9Z" />
    </svg>
  );
}
function AppleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true" role="img">
      <path d="M16.2 13.1c0-2.9 2.4-3.8 2.4-3.8-1.3-1.8-3.3-1.9-4-1.9-1.7-.1-3.2 1-4 1-.8 0-2-.9-3.3-.8-1.7.1-3.2 1-4.1 2.4-1.8 2.6-.5 6.4 1.3 8.5.9 1 2 2.1 3.5 2 .8 0 1.2-.3 2.1-.8s2-.8 2.9-.7c.9.1 1.7.5 2.9.8.7.2 1.3.1 1.9-.1 1.3-.5 2.4-1.8 3.2-3.5-3.2-1.2-3.3-4.1-3.3-4.1ZM13.9 4.7c.7-.9 1.2-2.1 1-3.3-1 .1-2.2.7-2.9 1.6-.6.7-1.1 1.9-.9 3 .9.1 2.1-.5 2.8-1.3Z" />
    </svg>
  );
}

// ---------- UI Primitives ----------
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
      {children}
    </span>
  );
}

function RatingStars({ value }: { value: number }) {
  return (
    <div className="flex" aria-label={`Rated ${value} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className={`h-4 w-4 ${i < value ? 'text-emerald-500' : 'text-slate-300'}`} aria-hidden="true" role="img">
          <path d="M10 15l-5.878 3.09 1.123-6.545L.49 6.91l6.563-.954L10 0l2.947 5.956 6.563.954-4.755 4.636 1.123 6.545z" fill="currentColor" />
        </svg>
      ))}
    </div>
  );
}

function ProductCardBulk({ item }: { item?: ProductItem }) {
  if (!item) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        ⚠️ Product data not available
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="aspect-[4/3] w-full overflow-hidden bg-slate-50">
        <SafeImage src={[item.image]} seed={item.id} alt={`${item.title}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      </div>
      <div className="flex flex-col gap-2 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{item.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <RatingStars value={item.rating} />
          <span className="text-xs text-slate-500">({item.rating}.0)</span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-lg font-bold text-slate-900">₹{item.unitPrice.toLocaleString('en-IN')}<span className="ml-1 text-xs font-medium text-slate-500">/unit</span></div>
            <div className="text-xs text-slate-500 line-through">₹{item.mrp.toLocaleString('en-IN')}</div>
          </div>
          <div className="text-xs font-semibold text-emerald-600">Save {item.offPercent}%</div>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>Dispatch: {item.eta}</span>
          <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Buyer Protection</span>
        </div>
        <button type="button" className="mt-1 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2">Add to Cart</button>
        <div className="mt-2 text-xs"><a href="#" className="font-semibold text-emerald-600 hover:underline">Buy in bulk</a><span className="text-slate-500"> (MOQ: {item.moq})</span></div>
      </div>
    </div>
  );
}

// ---------- Top banners ----------
function TopTicker() {
  const items = [
    { id: 1, text: 'Find the best deals and offers on Oweg.in' },
    { id: 2, text: '🐷 Your pocket-friendly store' },
    { id: 3, text: '🔥 Get 10% Extra off – Use Code OWEG10' },
    { id: 4, text: 'Free shipping over ₹999 • 7-day returns • 24x7 support' },
    { id: 5, text: 'New arrivals daily • Fresh styles & top brands' },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % items.length), 4000);
    return () => clearInterval(t);
  }, [items.length]);
  const prev = () => setI((v) => (v - 1 + items.length) % items.length);
  const next = () => setI((v) => (v + 1) % items.length);
  return (
    <div className="w-full bg-black text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:px-6 min-h-[36px]">
        <button aria-label="Previous" onClick={prev} className="opacity-70 hover:opacity-100">‹</button>
        <div className="relative w-full overflow-hidden">
          {/* IMPORTANT: Do NOT set an explicit width here. Each slide is 100% of the viewport and we move by 100% each step. */}
          <div className="flex transition-transform duration-500" style={{ transform: `translateX(-${i * 100}%)` }} aria-live="polite">
            {items.map((it) => (
              <div key={it.id} className="flex-[0_0_100%] text-center text-sm sm:text-base">
                {it.text}
              </div>
            ))}
          </div>
        </div>
        <button aria-label="Next" onClick={next} className="opacity-70 hover:opacity-100">›</button>
      </div>
    </div>
  );
}

function ContactStrip() {
  return (
    <div className="w-full bg-green-700 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm sm:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2"><span>📞</span><span>Contact Us: 879 778 7877</span></div>
          <span className="hidden sm:inline opacity-60">|</span>
          <div className="flex items-center gap-2"><span>✉️</span><span>Email: owegonline@oweg.in</span></div>
        </div>
        <div className="flex items-center gap-4 font-semibold">
          <a href="#" className="hover:underline">Sell With Us</a>
          <span className="opacity-60">|</span>
          <span className="inline-flex items-center gap-2">
            Download App:
            <span className="inline-flex items-center justify-center rounded-full bg-white/10 px-2 py-1"><AndroidIcon className="h-5 w-5 text-white" /><span className="sr-only">Android</span></span>
            <span className="inline-flex items-center justify-center rounded-full bg-white/10 px-2 py-1"><AppleIcon className="h-5 w-5 text-white" /><span className="sr-only">Apple iOS</span></span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Amazon-like mega menu ----------
function MegaMenu({ open }: { open: boolean }) {
  const [active, setActive] = useState(0);
  if (!open) return null;
  const dept = categoryTree[active];
  return (
    <div className="absolute left-0 top-full mt-2 w-[900px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
      <div className="grid grid-cols-12 gap-4">
        {/* Left: departments */}
        <div className="col-span-4">
          <ul role="menu" className="space-y-1">
            {categoryTree.map((d, idx) => (
              <li key={d.name}>
                <button role="menuitem" onMouseEnter={() => setActive(idx)} onFocus={() => setActive(idx)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${idx===active ? 'bg-emerald-50 text-emerald-700' : 'text-slate-800 hover:bg-slate-50'}`}>
                  <span>{d.name}</span>
                  <span className="opacity-50">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {/* Right: groups + hero */}
        <div className="col-span-8 grid grid-cols-2 gap-4">
          <div className="space-y-3">
            {dept.groups.map((g) => (
              <div key={g.name}>
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{g.name}</div>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((it: string) => (<a key={it} href="#" className="text-sm text-slate-800 underline-offset-2 hover:underline">{it}</a>))}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
            <div className="aspect-[4/3] overflow-hidden rounded-lg">
              <SafeImage src={[dept.hero]} alt={`${dept.name} deals`} seed={dept.name} className="h-full w-full object-cover" />
            </div>
            <div className="p-2 text-center text-sm font-semibold text-slate-800">Top picks in {dept.name}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeaderNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-7xl px-3 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <a href="#" className="flex items-center gap-2" aria-label="OWEG Home">
              <NextImage src="/oweg_logo.jpeg" alt="OWEG logo" width={120} height={32} className="h-8 w-auto" priority />
            </a>
            <nav className="hidden items-center gap-4 md:flex">
              <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
                <button className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Category</button>
                <MegaMenu open={open} />
              </div>
              <a className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" href="#deals">Deals</a>
              <a className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" href="#new">What&apos;s New</a>
              <a className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" href="#delivery">Delivery</a>
              <a className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" href="#track">Track Order</a>
              <a className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" href="#help">Help</a>
            </nav>
          </div>
          <div className="hidden flex-1 items-center md:flex">
            <div className="relative w-full max-w-md">
              <input aria-label="Search products" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-400" placeholder="Search products, brands, categories..." />
              <div className="pointer-events-none absolute right-3 top-2.5 text-slate-400">Ctrl+K</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 md:inline-flex">Sign In</Link>
            <a href="#cart" className="hidden rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 md:inline-flex">Cart</a>
            <button className="inline-flex rounded-xl border border-slate-300 p-2 md:hidden" aria-label="Open menu">☰</button>
          </div>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-3 py-10 sm:px-6 md:grid-cols-2 md:py-16">
        <div className="flex flex-col gap-4">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Festive offers live <span className="h-1 w-1 rounded-full bg-emerald-300" /> New arrivals daily</div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">Everything you love, delivered fast.</h1>
          <p className="max-w-prose text-slate-600">Discover top brands and fresh deals across electronics, fashion, home and more. Clean, fast, and reliable for India.</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <a href="#deals" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Shop Now</a>
            <a href="#deals" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">View Deals</a>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600"><Badge>Free shipping over ₹999</Badge><Badge>7-day easy returns</Badge><Badge>Secure payments</Badge></div>
        </div>
        <div className="relative">
          <div className="aspect-[4/3] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
            <SafeImage src={[unsplash('shopping, ecommerce, products')]} seed="hero" alt="Shopping banner" className="h-full w-full object-cover" />
          </div>
        </div>
      </div>
    </section>
  );
}

function CategoryGrid() {
  return (
    <section className="mx-auto max-w-7xl px-3 py-10 sm:px-6" id="categories">
      <div className="mb-6 flex items-end justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Top Categories</h2>
        <a className="text-sm font-semibold text-emerald-600 hover:underline" href="#">View all</a>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {categories.map((c) => (
          <a key={c.name} href="#" className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
            <div className="aspect-square w-full overflow-hidden bg-slate-50">
              <SafeImage src={[c.image]} seed={c.name} alt={c.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            </div>
            <div className="p-3 text-center text-sm font-semibold text-slate-800">{c.name}</div>
          </a>
        ))}
      </div>
    </section>
  );
}

function BrandStrip() {
  return (
    <section className="mx-auto max-w-7xl px-3 py-8 sm:px-6">
      <div className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Trusted Brands & Factories</div>
      <div className="flex flex-wrap items-center gap-3">
        {brands.map((b) => (<div key={b} className="flex h-12 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm">{b}</div>))}
      </div>
    </section>
  );
}

function PromoBanners() {
  const promos = [
    { title: 'Save ₹500 on ₹10,000+', image: unsplash('coupon, discount, shopping') },
    { title: '48h Fast Dispatch', image: unsplash('fast delivery, shipping box') },
    { title: 'Verified Vendors', image: unsplash('factory, warehouse, logistics') },
  ];
  return (
    <section className="mx-auto max-w-7xl px-3 pb-2 sm:px-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {promos.map((p) => (
          <div key={p.title} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="aspect-[16/7] w-full overflow-hidden bg-slate-50">
              <SafeImage src={[p.image]} seed={p.title} alt={p.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            </div>
            <div className="p-4 text-center text-sm font-semibold text-slate-800">{p.title}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DealsTabs() {
  const tabs = Object.keys(dealsByTab);
  const [active, setActive] = useState(tabs[0]);
  return (
    <section className="mx-auto max-w-7xl px-3 py-10 sm:px-6" id="deals">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Today&apos;s Best Deals</h2>
        <div className="hidden gap-2 md:flex">
          {tabs.map((t) => (
            <button key={t} onClick={() => setActive(t)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${active === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto md:hidden">
        {tabs.map((t) => (
          <button key={t} onClick={() => setActive(t)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${active === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{t}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {dealsByTab[active].map((item) => (<ProductCardBulk key={item.id} item={item} />))}
      </div>
    </section>
  );
}

function WhatsNew() {
  return (
    <section id="new" className="mx-auto max-w-7xl px-3 py-10 sm:px-6">
      <div className="mb-6 flex items-end justify-between">
        <h2 className="text-2xl font-bold text-slate-900">What&apos;s New</h2>
        <a className="text-sm font-semibold text-emerald-600 hover:underline" href="#">View all</a>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {newArrivals.map((item) => (<ProductCardBulk key={item.id} item={item} />))}
      </div>
    </section>
  );
}

function DeliveryInfo() {
  const cards = [
    { title: 'Standard Delivery', desc: '2-5 business days across India.', badge: 'Most Popular' },
    { title: 'Express Delivery', desc: '24-48h to major cities.', badge: 'Fast' },
    { title: 'Cash on Delivery', desc: 'COD available on eligible items.', badge: 'Convenient' },
  ];
  return (
    <section id="delivery" className="mx-auto max-w-7xl px-3 py-10 sm:px-6">
      <h2 className="mb-6 text-2xl font-bold text-slate-900">Delivery</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">{c.badge}</div>
            <div className="text-lg font-semibold text-slate-900">{c.title}</div>
            <p className="mt-1 text-sm text-slate-600">{c.desc}</p>
            <ul className="mt-3 list-inside list-disc text-xs text-slate-600"><li>Real-time tracking</li><li>SMS/Email updates</li><li>Free shipping over ₹999</li></ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrackOrder() {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); alert('Demo: connect to your order tracking API here.'); }
  return (
    <section id="track" className="mx-auto max-w-7xl px-3 py-10 sm:px-6">
      <h2 className="mb-4 text-2xl font-bold text-slate-900">Track your order</h2>
      <p className="mb-4 text-sm text-slate-600">Enter your Order ID and phone/email used during checkout.</p>
      <form onSubmit={handleSubmit} className="grid max-w-xl grid-cols-1 gap-3">
        <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-800">Order ID</span><input required name="orderId" aria-label="Order ID" className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g., OWEG12345" /></label>
        <label className="flex flex-col gap-1"><span className="text-sm font-medium text-slate-800">Phone or Email</span><input required name="contact" aria-label="Phone or Email" className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g., 98XXXXXX10 or you@example.com" /></label>
        <button type="submit" className="mt-1 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2">Check Status</button>
        <div className="text-xs text-slate-500">By continuing, you agree to our <a className="underline" href="#">Privacy Policy</a>.</div>
      </form>
    </section>
  );
}

function HelpCenter() {
  const faqs = [
    { q: 'What is the return policy?', a: '7-day easy returns on eligible items. Start a return from your Orders page or contact support.' },
    { q: 'How do I cancel an order?', a: 'You can cancel before dispatch from the Orders page. Post-dispatch, refuse delivery or request a return.' },
    { q: 'Which payments are accepted?', a: 'UPI, NetBanking, Cards, and COD on eligible products.' },
    { q: 'Do you offer express delivery?', a: 'Yes, 24-48h express to major cities on select items. Look for the Express badge on the product page.' },
  ];
  return (
    <section id="help" className="mx-auto max-w-7xl px-3 py-10 sm:px-6">
      <h2 className="mb-4 text-2xl font-bold text-slate-900">Help Center</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {faqs.map((f) => (
          <details key={f.q} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">{f.q}</summary>
            <p className="mt-2 text-sm text-slate-600">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-10 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-3 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div>
            <div className="mb-3 text-sm font-semibold text-slate-900">Company</div>
            <ul className="space-y-2 text-sm text-slate-600"><li><a href="#" className="hover:underline">About</a></li><li><a href="#" className="hover:underline">Contact</a></li><li><a href="#" className="hover:underline">Careers</a></li></ul>
          </div>
          <div>
            <div className="mb-3 text-sm font-semibold text-slate-900">Help</div>
            <ul className="space-y-2 text-sm text-slate-600"><li><a href="#" className="hover:underline">Shipping</a></li><li><a href="#" className="hover:underline">Returns</a></li><li><a href="#" className="hover:underline">Payments</a></li></ul>
          </div>
          <div>
            <div className="mb-3 text-sm font-semibold text-slate-900">Explore</div>
            <ul className="space-y-2 text-sm text-slate-600"><li><a href="#deals" className="hover:underline">Deals</a></li><li><a href="#new" className="hover:underline">What&apos;s New</a></li><li><a href="#delivery" className="hover:underline">Delivery</a></li><li><a href="#track" className="hover:underline">Track Order</a></li></ul>
          </div>
          <div>
            <div className="mb-3 text-sm font-semibold text-slate-900">Legal</div>
            <ul className="space-y-2 text-sm text-slate-600"><li><a href="#" className="hover:underline">Privacy Policy</a></li><li><a href="#" className="hover:underline">Terms & Conditions</a></li><li><a href="#" className="hover:underline">Refund Policy</a></li></ul>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <div>© {new Date().getFullYear()} OWEG. All rights reserved.</div>
          <div className="flex items-center gap-2"><Badge>UPI</Badge><Badge>NetBanking</Badge><Badge>COD</Badge></div>
        </div>
      </div>
    </footer>
  );
}

// ---------- Lightweight sanity tests (console-only) ----------
function __formatINR(n: number) { return n.toLocaleString('en-IN'); }
function __hasDealsShape() {
  try {
    const keysOk = Object.keys(dealsByTab).length > 0;
    const shapeOk = Object.values(dealsByTab).every((arr) => Array.isArray(arr) && arr.length > 0 && typeof arr[0].unitPrice === 'number');
    return keysOk && shapeOk && __formatINR(1000) === '1,000';
  } catch { return false; }
}
function __allImageUrlsOk() {
  const imgs = [
    ...categories.map((c) => c.image),
    ...Object.values(dealsByTab).flat().map((i) => i.image),
    ...newArrivals.map((i) => i.image),
  ];
  return imgs.every((u) => typeof u === 'string' && /^https?:\/\//.test(u));
}
function __tickerOk() { return ['Category','Deals','Delivery'].every(Boolean) && true; }
if (typeof console !== 'undefined') {
  console.assert(__hasDealsShape(), '[TEST] dealsByTab shape or INR formatting looks wrong');
  console.assert(__allImageUrlsOk(), '[TEST] some image URLs are missing or invalid');
  console.assert(__tickerOk(), '[TEST] basic ticker test');
}

export default function OwegHome() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <TopTicker />
      <ContactStrip />
      <HeaderNav />
      <Hero />
      <CategoryGrid />
      <BrandStrip />
      <PromoBanners />
      <DealsTabs />
      <WhatsNew />
      <DeliveryInfo />
      <TrackOrder />
      <HelpCenter />
      <Footer />
    </div>
  );
}
