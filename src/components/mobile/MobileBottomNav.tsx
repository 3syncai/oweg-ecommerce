'use client';

import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Grid,
  Heart,
  Home,
  Mail,
  LogIn,
  Facebook, Twitter, Instagram, Linkedin,
  LogOut,
  MapPin,
  Phone,
  Shield,
  ShoppingBag,
  Search,
  Store,
  User,
  UserPlus,
  X,
  ChevronsLeft,
} from 'lucide-react';
import type { MedusaCategory } from '@/lib/medusa';
import { useAuth } from '@/contexts/AuthProvider';
import { getOriginalImageUrl } from '@/lib/image-utils';

type MobileCategory = {
  id: string;
  title: string;
  handle?: string;
  image?: string;
  children?: MobileCategory[];
};

type ProductLike = {
  id?: string | number;
  handle?: string | number;
  title?: string;
  name?: string;
  image?: string;
  thumbnail?: string;
  images?: Array<{ url?: string | null } | string | null> | null;
  variants?: Array<{ thumbnail?: string | null } | null> | null;
  metadata?: Record<string, unknown> | null;
  price?: number;
  mrp?: number;
  discount?: number;
  tags?: Array<{ value?: string; handle?: string } | string>;
  collection?: { title?: string | null; handle?: string | null };
};

const normalizeCategoryKey = (title?: string) =>
  (title || '')
    .toString()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');

const categoryImageMap: Record<string, string> = {
  'home-appliances': '/Home Appliances.png',
  'kitchen-appliances': '/Kitchen Appliances.png',
  'beauty-personal-care': '/beauty-personal-care.png',
  'computer-mobile': '/Computer & Mobile v1.png',
  'computer-mobile-accessories': '/Computer & Mobile v1.png',
  'mobile-accessories': '/Computer & Mobile v1.png',
  hardware: '/Hardwear-01.png',
  'hard-wear': '/Hardwear-01.png',
  bags: '/Bags-01.png',
  clothing: '/Clothing-01.png',
  'security-surveillance': '/security & surveillance.png',
  'surveillance-security': '/security & surveillance.png',
  'toys-and-games': '/Toysandgames.png',
  jewellery: '/Jewellery.png',
  umbrella: '/Umbrella.png',
  'health-care': '/Sassiest-Health-Care.png',
  health: '/Sassiest-Health-Care.png',
  stationery: '/Stationery.png',
  stationary: '/Stationery.png',
};

const customSubcategoryImages: Record<string, string> = {
  'home-decor': '/Home_Decor.jpg',
  mop: '/Mop.jpg',
  'lunch-box': '/Lunch_Box.jpg',
  'led-bulbs': '/Led_Bulbs.jpg',
  'led-lamps-torches': '/Led_Lamps_&_Torches.jpg',
  'led-lamps-and-torches': '/Led_Lamps_&_Torches.jpg',
  'bottles-flasks': '/Bottles_&_Flasks.jpg',
  'bottles-and-flasks': '/Bottles_&_Flasks.jpg',
  'water-pumps': '/Water_Pumps.png',
  'air-coolers': '/Air_Coolers.jpg',
  'ceiling-fans': '/Ceiling_Fans.jpg',
  choppers: '/Choppers.png',
  'cutlery-sets': '/Cutlery_Sets.jpg',
  'electric-plug': '/Electric_Plug.jpg',
  'hose-pipes': '/Hose_Pipes.jpg',
  'immersion-rods': '/Immersion_Rods.jpg',
  'inverter-and-battery': '/Inverter_&_Battery.jpg',
  iron: '/Iron.jpg',
  'room-heater': '/Room_Heater.jpg',
  'table-fans': '/Table_Fans.jpg',
  tape: '/Tape.jpg',
  tubelights: '/Tubelights.jpg',
  'water-heaters-and-geysers': '/Water_Heaters_&_Geysers.jpg',
  kettles: '/Kettles.jpg',
};

const categoryImageKeywords: Array<{ image: string; includes: string[] }> = [
  { image: '/Home Appliances.png', includes: ['home', 'appliance'] },
  { image: '/Kitchen Appliances.png', includes: ['kitchen', 'appliance'] },
  { image: '/beauty-personal-care.png', includes: ['beauty'] },
  { image: '/beauty-personal-care.png', includes: ['personal', 'care'] },
  { image: '/Computer & Mobile v1.png', includes: ['computer'] },
  { image: '/Computer & Mobile v1.png', includes: ['mobile'] },
  { image: '/Hardwear-01.png', includes: ['hardware'] },
  { image: '/Hardwear-01.png', includes: ['hard', 'wear'] },
  { image: '/Bags-01.png', includes: ['bag'] },
  { image: '/Clothing-01.png', includes: ['cloth'] },
  { image: '/security & surveillance.png', includes: ['security'] },
  { image: '/security & surveillance.png', includes: ['surveillance'] },
  { image: '/security & surveillance.png', includes: ['surveillance', 'security'] },
  { image: '/Toysandgames.png', includes: ['toy'] },
  { image: '/Toysandgames.png', includes: ['game'] },
  { image: '/Jewellery.png', includes: ['jewel'] },
  { image: '/Umbrella.png', includes: ['umbrella'] },
  { image: '/Sassiest-Health-Care.png', includes: ['health'] },
  { image: '/Stationery.png', includes: ['stationery'] },
  { image: '/Stationery.png', includes: ['stationary'] },
  { image: '/Computer & Mobile v1.png', includes: ['mobile', 'accessor'] },
  { image: '/Computer & Mobile v1.png', includes: ['computer', 'accessor'] },
];

const buildCategoryList = (data?: unknown): MobileCategory[] => {
  const raw: MedusaCategory[] = Array.isArray((data as { categories?: MedusaCategory[] })?.categories)
    ? ((data as { categories?: MedusaCategory[] }).categories as MedusaCategory[])
    : [];
  return raw.map((cat, idx) => {
    const baseId = cat.id || cat.handle || cat.title || `cat-${idx}`;
    return {
      id: baseId,
      title: (cat.title || cat.name || 'Category').toString(),
      handle: cat.handle || undefined,
      image:
        (cat as MedusaCategory & { metadata?: { thumbnail?: string; image?: string } }).metadata?.thumbnail ||
        (cat as MedusaCategory & { metadata?: { thumbnail?: string; image?: string } }).metadata?.image ||
        undefined,
      children: Array.isArray(cat.category_children)
        ? cat.category_children.map((child, cIdx) => ({
            id: child.id || child.handle || child.title || `${baseId}-child-${cIdx}`,
            title: (child.title || child.name || 'Category').toString(),
            handle: child.handle || undefined,
          }))
        : [],
    };
  });
};

const resolveProductImage = (p: ProductLike): string => {
  const candidates: Array<string | undefined | null> = [];
  candidates.push(p?.image);
  candidates.push(p?.thumbnail);
  if (Array.isArray(p?.images)) {
    p.images.forEach((img) => {
      if (!img) return;
      if (typeof img === 'string') {
        candidates.push(img);
        return;
      }
      candidates.push((img as { url?: string | null; original_url?: string | null }).original_url);
      candidates.push((img as { url?: string | null }).url);
    });
  }
  if (Array.isArray(p?.variants)) {
    p.variants.forEach((v) => {
      if (!v) return;
      candidates.push((v as { thumbnail?: string | null }).thumbnail);
      if (Array.isArray((v as { images?: Array<{ url?: string | null; original_url?: string | null } | null> | null }).images)) {
        (v as { images?: Array<{ url?: string | null; original_url?: string | null } | null> | null }).images!.forEach((img) => {
          if (!img) return;
          candidates.push(img.original_url);
          candidates.push(img.url);
        });
      }
    });
  }
  const meta = (p?.metadata || {}) as Record<string, unknown>;
  ['image', 'thumbnail', 'img', 'picture', 'photo', 'image_url', 'url'].forEach((key) => {
    const val = meta[key] as string | undefined;
    if (typeof val === 'string') candidates.push(val);
  });
  const metaImages = meta.images;
  if (Array.isArray(metaImages)) {
    metaImages.forEach((item) => {
      if (typeof item === 'string') candidates.push(item);
      if (item && typeof item === 'object' && 'url' in item) {
        candidates.push((item as { url?: string }).url);
      }
    });
  }

  const pick = candidates.find((c) => typeof c === 'string' && c.trim().length > 0) || '';
  if (!pick) return '/oweg_logo.png';
  const normalized = getOriginalImageUrl(pick.trim());
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;
  if (normalized.startsWith('/')) {
    if (typeof window !== 'undefined') {
      return new URL(normalized, window.location.origin).href;
    }
  }
  return normalized || '/oweg_logo.png';
};

const resolveCategoryImage = (src?: string): string => {
  if (!src) return '/oweg_logo.png';
  const normalized = getOriginalImageUrl(src);
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;
  if (normalized.startsWith('/')) {
    if (typeof window !== 'undefined') {
      return new URL(normalized, window.location.origin).href;
    }
  }
  return normalized || '/oweg_logo.png';
};

const getCategoryDisplayImage = (cat: MobileCategory): string => {
  const key = normalizeCategoryKey(cat.title);
  const handleKey = normalizeCategoryKey(cat.handle);

  const custom = customSubcategoryImages[handleKey] || customSubcategoryImages[key];
  if (custom) return resolveCategoryImage(custom);

  const mapped = categoryImageMap[key] || categoryImageMap[cat.handle || ''];
  if (mapped) return resolveCategoryImage(mapped);

  const normalizedTitle = key;
  const normalizedHandle = normalizeCategoryKey(cat.handle);
  const tokens = `${normalizedTitle} ${normalizedHandle}`.split('-').filter(Boolean);

  const keywordHit = categoryImageKeywords.find(({ includes }) =>
    includes.every((kw) => tokens.some((t) => t.includes(kw)))
  );
  if (keywordHit) return resolveCategoryImage(keywordHit.image);

  if (cat.image) return resolveCategoryImage(cat.image);
  return '/oweg_logo.png';
};

const getProductBrand = (p: ProductLike): string => {
  const meta = (p.metadata || {}) as Record<string, unknown>;
  const brand =
    (meta.brand as string | undefined) ||
    (meta.Brand as string | undefined) ||
    (meta.brand_name as string | undefined) ||
    (meta.BrandName as string | undefined) ||
    (meta.manufacturer as string | undefined) ||
    (meta.maker as string | undefined) ||
    (p.collection?.title as string | undefined) ||
    (p.collection?.handle as string | undefined);
  if (typeof brand === 'string' && brand.trim()) return brand.trim();
  const tagBrand = Array.isArray(p.tags)
    ? p.tags
        .map((t) => (typeof t === 'string' ? t : t?.value || t?.handle || ''))
        .map((s) => s.trim())
        .find((s) => s.length > 0)
    : '';
  if (tagBrand) return tagBrand;
  return '';
};

const formatCurrency = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `₹${Math.round(value)}`;
  }
};

const Overlay = ({
  open,
  onClose,
  children,
  scrollable = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  scrollable?: boolean;
}) => (
  <div
    className={`fixed inset-0 z-[110] md:hidden transition-opacity duration-200 ${
      open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
    }`}
    onClick={onClose}
  >
    <div
      className={`absolute inset-x-0 top-0 bottom-0 bg-white transition-transform duration-200 ${
        open ? 'translate-y-0' : 'translate-y-full'
      } shadow-[0_-6px_30px_-20px_rgba(0,0,0,0.35)] rounded-t-2xl border-t border-gray-100 overflow-hidden`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`h-full ${scrollable ? 'overflow-y-auto' : 'overflow-hidden'} px-4 pt-20 pb-[env(safe-area-inset-bottom,0px)]`}
      >
        {children}
      </div>
    </div>
  </div>
);

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { customer, logout } = useAuth();
  const [storedPincode, setStoredPincode] = useState('');
  const resetPanels = useCallback(() => {
    setCategoryOpen(false);
    setProfileOpen(false);
    setJoinOpen(false);
  }, []);
  const wishlistCount = useMemo(() => {
    const list = (customer?.metadata as Record<string, unknown> | undefined)?.wishlist;
    if (Array.isArray(list)) return list.length;
    return 0;
  }, [customer?.metadata]);
  const { data: categoryData, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/medusa/categories', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Unable to load categories');
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });
  const categories = useMemo(() => buildCategoryList(categoryData), [categoryData]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<MobileCategory | null>(null);
  const [subProducts, setSubProducts] = useState<
    Array<{ id: string; name: string; image?: string; price?: number; mrp?: number; discount?: number; brand?: string }>
  >([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<MobileCategory | null>(null);
  const [priceSort, setPriceSort] = useState<'none' | 'asc' | 'desc'>('none');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [sidebarOverlayOpen, setSidebarOverlayOpen] = useState(false);
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const lastCategoryIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedSubcategory) {
      setIsOpen(false);
      setSidebarOverlayOpen(false);
    }
  }, [selectedSubcategory]);
  useEffect(() => {
    if (!categoryOpen) return;
    setIsOpen(false);
    setSidebarOverlayOpen(false);
    setExpandedCatId(null);
  }, [categoryOpen]);
  useEffect(() => {
    if (!sidebarOverlayOpen) return;
    if (!selectedCategoryId) return;
    if (expandedCatId !== selectedCategoryId) {
      setExpandedCatId(selectedCategoryId);
    }
  }, [sidebarOverlayOpen, selectedCategoryId, expandedCatId]);
  useEffect(() => {
    if (!sidebarOverlayOpen) return;
    if (!selectedCategoryId) return;
    if (selectedCategoryId !== lastCategoryIdRef.current) {
      setIsOpen(false);
      setSidebarOverlayOpen(false);
      lastCategoryIdRef.current = selectedCategoryId;
    }
  }, [selectedCategoryId, sidebarOverlayOpen]);
  const closeCategory = () => {
    setCategoryOpen(false);
    setActiveCategory(null);
    setSearchTerm('');
  };
  const closeProfile = () => setProfileOpen(false);
  const closeJoin = () => setJoinOpen(false);
  const overlayOpen = categoryOpen || profileOpen || joinOpen;
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = overlayOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [overlayOpen]);

  // stop auto-selecting first category so products show only after user taps
  useEffect(() => {
    if (!categoryOpen) {
      setSelectedCategoryId(null);
      setSelectedSubcategory(null);
      setActiveCategory(null);
    }
  }, [categoryOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const cls = 'category-overlay-open';
    if (categoryOpen) {
      document.body.classList.add(cls);
    } else {
      document.body.classList.remove(cls);
    }
    return () => {
      document.body.classList.remove(cls);
    };
  }, [categoryOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pin = window.localStorage.getItem('oweg_pincode') || '';
    setStoredPincode(pin);
  }, [overlayOpen, pathname]);

  useEffect(() => {
    resetPanels();
  }, [pathname, resetPanels]);

  const categoriesWithChildren = useMemo(
    () => categories.filter((cat) => Array.isArray(cat.children) && cat.children.length > 0),
    [categories]
  );

  useEffect(() => {
    if (!categoryOpen) return;
    if (selectedCategoryId) return;
    const preferred = categoriesWithChildren.find((c) => normalizeCategoryKey(c.title) === 'home-appliances');
    const fallback = categoriesWithChildren[0];
    const target = preferred || fallback;
    if (target) {
      setSelectedCategoryId(target.id);
      setSelectedSubcategory(null);
    }
  }, [categoryOpen, categoriesWithChildren, selectedCategoryId]);

  const filteredCategories = useMemo(() => {
    if (selectedSubcategory) return categoriesWithChildren;
    if (!searchTerm.trim()) return categoriesWithChildren;
    const term = searchTerm.toLowerCase();
    return categoriesWithChildren.filter((cat) => cat.title.toLowerCase().includes(term));
  }, [categoriesWithChildren, searchTerm]);

  const displayedCategory = useMemo(() => {
    if (!selectedCategoryId) return null;
    return filteredCategories.find((c) => c.id === selectedCategoryId) || null;
  }, [filteredCategories, selectedCategoryId]);

  useEffect(() => {
    if (selectedCategoryId && !displayedCategory) {
      setSelectedCategoryId(null);
      setSelectedSubcategory(null);
      setActiveCategory(null);
    }
  }, [displayedCategory, selectedCategoryId]);

  useEffect(() => {
    if (!displayedCategory) return;
    setActiveCategory(displayedCategory);
    // keep subcategory unselected by default; user must tap one
    setSelectedSubcategory(null);
  }, [displayedCategory]);

  useEffect(() => {
    const target = selectedSubcategory;
    if (!target) {
      setSubProducts([]);
      setProductsLoading(false);
      return;
    }
    const fetchProducts = async () => {
      setProductsLoading(true);
      try {
        const query =
          target.handle && target.handle.length > 0
            ? `category=${encodeURIComponent(target.handle)}`
            : target.id
              ? `categoryId=${encodeURIComponent(target.id)}`
              : '';
        if (!query) {
          setSubProducts([]);
          setProductsLoading(false);
          return;
        }
        const res = await fetch(`/api/medusa/products?${query}&limit=24`, { cache: 'no-store' });
        if (!res.ok) {
          setSubProducts([]);
        } else {
          const data = await res.json();
          const productArray: ProductLike[] = Array.isArray(data?.products) ? (data.products as ProductLike[]) : [];
          const products = productArray.map((p) => {
            const brand = getProductBrand(p);
            return {
              id: String(p.id || p.handle || Math.random()),
              name: p.title || p.name || 'Product',
              image: resolveProductImage(p),
              price: typeof p.price === 'number' ? p.price : undefined,
              mrp: typeof p.mrp === 'number' ? p.mrp : undefined,
              discount: typeof p.discount === 'number' ? p.discount : undefined,
              brand,
            };
          });
          setSubProducts(products);
        }
      } catch {
        setSubProducts([]);
      } finally {
        setProductsLoading(false);
      }
    };
    void fetchProducts();
  }, [selectedSubcategory, activeCategory]);

  useEffect(() => {
    setFiltersOpen(false);
  }, [selectedSubcategory, selectedCategoryId, categoryOpen]);

  const filteredProducts = useMemo(() => {
    let list = subProducts;
    if (selectedSubcategory && searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(term));
    }
    const min = priceMin.trim() ? Number(priceMin) : undefined;
    const max = priceMax.trim() ? Number(priceMax) : undefined;
    if (brandFilter) {
      list = list.filter((p) => (p.brand || '').toLowerCase() === brandFilter.toLowerCase());
    }
    if (Number.isFinite(min)) {
      list = list.filter((p) => typeof p.price === 'number' && (p.price as number) >= (min as number));
    }
    if (Number.isFinite(max)) {
      list = list.filter((p) => typeof p.price === 'number' && (p.price as number) <= (max as number));
    }
    if (priceSort === 'asc') {
      list = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (priceSort === 'desc') {
      list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
    }
    return list;
  }, [subProducts, brandFilter, priceMin, priceMax, priceSort]);

  useEffect(() => {
    const brands = Array.from(
      new Set(
        subProducts
          .map((p) => p.brand || '')
          .map((b) => b.trim())
          .filter((b) => b.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));
    setAvailableBrands(brands);
    if (brands.length === 0) {
      setBrandFilter('');
    } else if (brandFilter && !brands.includes(brandFilter)) {
      setBrandFilter('');
    }
  }, [subProducts, brandFilter]);

  const navItems = [
    {
      key: 'home',
      label: 'Home',
      href: '/',
      icon: <Home className="w-5 h-5" />,
      active: pathname === '/',
    },
    ...(customer
      ? [
          {
            key: 'for-you',
            label: 'For You',
            href: '/for-you',
            active: pathname?.startsWith('/for-you'),
          },
        ]
      : []),
    {
      key: 'category',
      label: 'Category',
      onClick: () => {
        closeJoin();
        closeProfile();
        setCategoryOpen(true);
      },
      icon: <Grid className="w-5 h-5" />,
      active: categoryOpen,
    },
    {
      key: 'join',
      label: 'Join OWEG',
      onClick: () => {
        closeCategory();
        closeProfile();
        setJoinOpen(true);
      },
      icon: <Store className="w-5 h-5" />,
      accent: true,
      active: joinOpen,
    },
    {
      key: 'wishlist',
      label: 'Wishlist',
      href: '/wishlist',
      badge: wishlistCount,
      icon: <Heart className="w-5 h-5" />,
      active: pathname?.startsWith('/wishlist'),
    },
    {
      key: 'profile',
      label: 'Profile',
      onClick: () => {
        closeCategory();
        closeJoin();
        setProfileOpen(true);
      },
      icon: <User className="w-5 h-5" />,
      active: profileOpen,
    },
  ];

  const customerName = useMemo(() => {
    if (!customer) return '';
    const first = typeof customer.first_name === 'string' ? customer.first_name.trim() : '';
    const last = typeof customer.last_name === 'string' ? customer.last_name.trim() : '';
    const full = `${first} ${last}`.trim();
    if (full) return full;
    if (customer.email) {
      const [local] = customer.email.split('@');
      return local || customer.email;
    }
    return 'Account';
  }, [customer]);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-400 md:hidden bg-white/98 backdrop-blur border-t border-gray-200 shadow-[0_-10px_30px_-18px_rgba(0,0,0,0.45)] rounded-t-3xl">
        <div className="px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2 flex items-center justify-between">
          {navItems.map((item) => {
            const active = item.active;
            const shared =
              'flex flex-col items-center gap-1 px-3 py-1 rounded-2xl text-[11px] font-semibold transition-colors duration-200 flex-1';
            const content = (
              <>
                <div
                  className={`relative w-11 h-11 rounded-2xl flex items-center justify-center ${
                    item.accent
                      ? 'bg-gradient-to-br from-emerald-500 to-lime-500 text-white shadow-lg'
                      : active
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        : 'bg-gray-50 text-gray-700 border border-transparent'
                  } transition-transform duration-150`}
                >
                  {item.icon}
                  {item.badge ? (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold px-1 flex items-center justify-center">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </div>
                <span className={active || item.accent ? 'text-emerald-700' : 'text-gray-700'}>{item.label}</span>
              </>
            );
            if (item.href) {
              // use router push to avoid any intermediary states
              return (
                <button
                  key={item.key}
                  type="button"
                  className={shared}
                  onClick={(e) => {
                    e.preventDefault();
                    resetPanels();
                    router.push(item.href!);
                  }}
                >
                  {content}
                </button>
              );
            }
            return (
              <button
                key={item.key}
                type="button"
                className={shared}
                onClick={() => {
                  resetPanels();
                  item.onClick?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category sheet */}
      <Overlay open={categoryOpen} onClose={closeCategory} scrollable={false}>
        <div className="space-y-4 relative">
          {!selectedSubcategory && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={isOpen ? 'Collapse categories' : 'Expand categories'}
                  aria-pressed={isOpen}
                  onClick={() => {
                    const next = !isOpen;
                    setIsOpen(next);
                    setSidebarOverlayOpen(next);
                    if (next) {
                      lastCategoryIdRef.current = selectedCategoryId;
                    }
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition active:scale-[0.97]"
                >
                  <ChevronsLeft className={`w-5 h-5 transition-transform duration-200 ${isOpen ? 'rotate-0' : 'rotate-180'}`} />
                </button>
                <h3 className="text-lg font-semibold text-gray-900 pt-1">Categories</h3>
              </div>
            </div>
          )}

          {/* <div className="relative">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={selectedSubcategory ? 'Search products' : 'Search categories'}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
          </div> */}

          {selectedSubcategory && sidebarOverlayOpen && (
            <div
              className="absolute inset-0 z-30 bg-black/20"
              onClick={() => setSidebarOverlayOpen(false)}
            >
              <div
                className="absolute top-0 left-0 h-full w-64 bg-white shadow-2xl border-r border-gray-100 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-900">Categories</h4>
                  <button
                    type="button"
                    onClick={() => setSidebarOverlayOpen(false)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-gray-200 text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2 px-3 py-3">
                  {filteredCategories.map((cat) => {
                    const active = displayedCategory?.id === cat.id;
                    const isExpanded = expandedCatId === cat.id;
                    const hasChildren = Array.isArray(cat.children) && cat.children.length > 0;
                    return (
                      <div key={cat.id} className={`rounded-2xl border ${active ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-gray-200 bg-white'}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategoryId(cat.id);
                            setSelectedSubcategory(null);
                            setActiveCategory(cat);
                            if (hasChildren) {
                              setExpandedCatId(cat.id);
                              setIsOpen(true);
                              setSidebarOverlayOpen(true);
                            } else {
                              setExpandedCatId(null);
                              setIsOpen(false);
                              setSidebarOverlayOpen(false);
                            }
                          }}
                          className="w-full px-2.5 py-2 flex items-center justify-between gap-2"
                          title={cat.title}
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-white border border-gray-100 flex items-center justify-center">
                              <Image
                                src={getCategoryDisplayImage(cat)}
                                alt={cat.title}
                                fill
                                className="object-contain"
                                sizes="48px"
                                unoptimized
                              />
                            </div>
                            <span className="text-sm font-semibold text-gray-800 line-clamp-2">{cat.title}</span>
                          </div>
                            {hasChildren ? (
                              <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            ) : null}
                          </button>
                          {hasChildren && isExpanded ? (
                            <div className="pb-2 px-3 space-y-2">
                              {cat.children!.map((child) => (
                                <button
                                  key={child.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedCategoryId(cat.id);
                                    setSelectedSubcategory(child);
                                    setActiveCategory(cat);
                                    setIsOpen(false);
                                    setSidebarOverlayOpen(false);
                                  }}
                                  className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-left text-sm font-semibold text-gray-800 hover:border-emerald-300"
                                >
                                  {child.title}
                                </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div
            className={`relative min-h-0 transition-all duration-300 ease-in-out ${selectedSubcategory ? '' : 'flex gap-3'}`}
            style={{ height: 'calc(100vh - 150px)' }}
          >
            {!selectedSubcategory && (
            <div
              className="flex-shrink-0 space-y-2 overflow-y-auto h-full pr-1 min-h-0 transition-all duration-300 ease-in-out"
              style={{ width: isOpen ? 240 : 90 }}
            >
              {categoriesLoading ? (
                <div className="text-sm text-gray-500">Loading categories…</div>
              ) : filteredCategories.length === 0 ? (
                <div className="text-sm text-gray-500">No categories found.</div>
              ) : (
                filteredCategories.map((cat) => {
                  const active = displayedCategory?.id === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(cat.id);
                        setSelectedSubcategory(null);
                      }}
                      className={`group w-full rounded-2xl border transition-all duration-300 text-left ${
                        active ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-gray-200 bg-white'
                      } ${isOpen ? 'px-2.5 py-2' : 'px-1.5 py-1.5'}`}
                      title={cat.title}
                    >
                      <div className="flex flex-col items-center">
                        <div
                          className="relative w-full rounded-xl overflow-hidden bg-white flex items-center justify-center"
                          style={{ height: isOpen ? 96 : 80 }}
                        >
                          <Image
                            src={getCategoryDisplayImage(cat)}
                            alt={cat.title}
                            fill
                            className="object-contain"
                            sizes={isOpen ? '140px' : '120px'}
                            unoptimized
                          />
                        </div>
                        {isOpen ? (
                          <span className="mt-2 text-[12px] font-semibold text-gray-800 text-center leading-tight transition-opacity duration-200">
                            {cat.title}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            )}

            <div className={`${selectedSubcategory ? 'w-full' : 'flex-1 min-w-0'} h-full min-h-0 overflow-y-auto pr-1 pb-2 transition-all duration-300 ease-in-out`}>
              <div className="space-y-3">
                {activeCategory && (activeCategory.children || []).length > 0 && !selectedSubcategory && (
                  <div className="grid grid-cols-2 gap-3 pb-2">
                    <div className="col-span-2 text-base font-semibold text-gray-900">
                      {activeCategory.title}
                    </div>
                    {activeCategory.children!.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => setSelectedSubcategory(child)}
                        className="flex flex-col items-center justify-center border px-3 py-3 text-center transition border-emerald-100 bg-white hover:border-emerald-400 hover:shadow"
                      >
                        <div className="relative w-full h-32 border border-emerald-100 bg-white overflow-hidden flex items-center justify-center">
                          <Image
                            src={getCategoryDisplayImage(child)}
                            alt={child.title}
                            fill
                            className={`object-contain ${
                              (() => {
                                const key = normalizeCategoryKey(child.title);
                                if (key === 'kettles') return 'scale-200';
                                if (key === 'table-fans') return "scale-150";
                                if (key === 'lunch-box') return "scale-130";
                                if (key === 'room-heater') return "scale-130";
                                if (key === 'choppers' || key === 'immersion-rods') return 'scale-200';
                                return 'scale-110';
                              })()
                            } p-2`}
                            sizes="240px"
                            unoptimized
                          />
                        </div>
                        <span className="mt-2 text-[13px] font-semibold text-gray-800 line-clamp-2">{child.title}</span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedSubcategory && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Show categories"
                        onClick={() => {
                          setIsOpen(true);
                          setSidebarOverlayOpen(true);
                          lastCategoryIdRef.current = selectedCategoryId;
                        }}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-800 shadow-sm text-base font-bold"
                      >
                        <ChevronsLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSubcategory(null);
                          setIsOpen(false);
                          setSidebarOverlayOpen(false);
                        }}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"
                      >
                        <ChevronRight className="w-3 h-3 rotate-180" />
                        All subcategories
                      </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700"
                          onClick={() => setFiltersOpen((v) => !v)}
                        >
                          Filters
                          <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform ${filtersOpen ? 'rotate-90' : ''}`} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        {activeCategory ? (
                          <span className="font-semibold text-gray-900">{activeCategory.title}</span>
                        ) : null}
                        <ChevronRight className="w-3 h-3 text-gray-400" />
                        <span className="font-semibold text-gray-900">{selectedSubcategory.title}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {filteredProducts.length} products available
                      </span>
                    </div>
                    {filtersOpen && (
                      <div className="flex flex-wrap gap-2 items-center text-xs text-gray-600 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-700 font-semibold">Sort:</span>
                          <select
                            value={priceSort}
                            onChange={(e) => setPriceSort(e.target.value as 'none' | 'asc' | 'desc')}
                            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                          >
                            <option value="none">Default</option>
                            <option value="asc">Price: Low to High</option>
                            <option value="desc">Price: High to Low</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-700 font-semibold">Brand:</span>
                          <select
                            value={brandFilter}
                            onChange={(e) => setBrandFilter(e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs min-w-[120px]"
                          >
                            <option value="">All</option>
                            {availableBrands.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-700 font-semibold">Price:</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder="Min"
                            value={priceMin}
                            onChange={(e) => setPriceMin(e.target.value)}
                            className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                          />
                          <span>–</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder="Max"
                            value={priceMax}
                            onChange={(e) => setPriceMax(e.target.value)}
                            className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                          />
                        </div>
                        {(priceSort !== 'none' || brandFilter || priceMin || priceMax) && (
                          <button
                            type="button"
                            onClick={() => {
                              setPriceSort('none');
                              setBrandFilter('');
                              setPriceMin('');
                              setPriceMax('');
                            }}
                            className="text-emerald-700 font-semibold"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {selectedSubcategory ? (
                  <div className="grid grid-cols-2 gap-4 pb-3">
                    {productsLoading ? (
                      <div className="col-span-2 text-sm text-gray-500">Loading products...</div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="col-span-2 text-sm text-gray-500">No products found.</div>
                    ) : (
                      filteredProducts.map((p) => (
                        <Link
                          key={p.id}
                          href={`/productDetail/${encodeURIComponent(p.id)}?id=${encodeURIComponent(p.id)}`}
                          className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm flex flex-col items-center gap-3"
                          onClick={closeCategory}
                        >
                          <div className="relative w-full h-44 rounded-xl bg-white border border-gray-100 overflow-hidden shadow-sm">
                            {p.image ? (
                              <Image
                                src={p.image}
                                alt={p.name}
                                fill
                                sizes="(max-width: 768px) 60vw, 240px"
                                className="object-contain p-3"
                                unoptimized
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">No image</div>
                            )}
                          </div>
                          <p className="text-sm text-center text-gray-800 line-clamp-2">{p.name}</p>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-emerald-700 font-semibold">{formatCurrency(p.price)}</span>
                            {p.mrp && p.mrp > (p.price || 0) ? (
                              <span className="text-gray-400 line-through">{formatCurrency(p.mrp)}</span>
                            ) : null}
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Tap a subcategory to view its products.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Overlay>

      {/* Profile sheet */}
      <Overlay open={profileOpen} onClose={closeProfile}>
        <div className="p-4 pt-12 pb-36 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              {/* <p className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Profile</p> */}
              <h1 className="text-2xl font-semibold text-gray-900">{customer ? `Hi, ${customerName}` : 'Welcome back'}</h1>
              <p className="text-xs text-gray-500">
                {customer ? 'Manage your account quickly.' : ''}
              </p>
            </div>
          </div>

          {customer && storedPincode ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-3 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white text-emerald-700 flex items-center justify-center border border-emerald-200">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800 leading-tight">Deliver to</p>
                <p className="text-xs text-emerald-700">{storedPincode}</p>
              </div>
            </div>
          ) : null}

          {!customer && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-3 shadow-sm space-y-2">
              <p className="text-sm font-semibold text-emerald-800">Sign in for a better experience</p>
              <p className="text-xs text-emerald-700">Sync your wishlist, track orders, and unlock personalized deals.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-center font-semibold shadow hover:bg-emerald-700"
                  onClick={() => {
                    closeProfile();
                    router.push('/login');
                  }}
                >
                  Login
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-emerald-200 text-emerald-700 px-4 py-2.5 text-center font-semibold shadow-sm hover:bg-emerald-50"
                  onClick={() => {
                    closeProfile();
                    router.replace('/signup');
                  }}
                >
                  Sign up
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/cart"
              className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3 flex items-center gap-2 text-sm font-semibold text-gray-800 shadow-sm"
              onClick={closeProfile}
            >
              <ShoppingBag className="w-4 h-4 text-emerald-600" />
              Cart & Checkout
            </Link>
            <Link
              href="/wishlist"
              className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3 flex items-center gap-2 text-sm font-semibold text-gray-800 shadow-sm"
              onClick={closeProfile}
            >
              <Heart className="w-4 h-4 text-emerald-600" />
              Wishlist
            </Link>
            <a
              href="mailto:owegonline@oweg.in"
              className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3 flex items-center gap-2 text-sm font-semibold text-gray-800 shadow-sm"
              onClick={closeProfile}
            >
              <Phone className="w-4 h-4 text-emerald-600" />
              Support
            </a>
            <Link
              href="/vendor-portal"
              className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3 flex items-center gap-2 text-sm font-semibold text-gray-800 shadow-sm"
              onClick={closeProfile}
            >
              <Store className="w-4 h-4 text-emerald-600" />
              My Shop
            </Link>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm">
              <p className="text-sm font-semibold text-gray-900 mb-2">My Account</p>
              <div className="flex flex-wrap gap-2">
                {['Brands', 'Gift Card', 'Affiliates', 'Specials', 'My Reward'].map((label) => (
                  <span key={label} className="px-3 py-1.5 rounded-full border border-emerald-100 text-emerald-700 text-[11px] font-semibold bg-emerald-50/60">
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm">
              <p className="text-sm font-semibold text-gray-900 mb-2">Policy</p>
              <div className="flex flex-wrap gap-2">
                {['Terms & Conditions', 'Returns Policy', 'Shipping Policy', 'Coupon Code Policy', 'Privacy Policy'].map((label) => (
                  <span key={label} className="px-3 py-1.5 rounded-full border border-emerald-100 text-emerald-700 text-[11px] font-semibold bg-emerald-50/60">
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm">
              <p className="text-sm font-semibold text-gray-900 mb-2">Quick Links</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'About Us', href: '/about' },
                  { label: 'FAQ', href: '/faq' },
                  { label: 'Contact', href: 'mailto:owegonline@oweg.in' },
                  { label: 'Seller Registration', href: '/vendor-portal' },
                  { label: 'Agent Registration', href: '/vendor-portal' },
                ].map((link) =>
                  link.href ? (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="px-3 py-1.5 rounded-full border border-emerald-100 text-emerald-700 text-[11px] font-semibold bg-emerald-50/60"
                      onClick={closeProfile}
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <span key={link.label} className="px-3 py-1.5 rounded-full border border-gray-100 text-gray-700 text-[11px] font-semibold bg-gray-50">
                      {link.label}
                    </span>
                  )
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm space-y-2">
              <p className="text-sm font-semibold text-gray-900">Support</p>
              <p className="text-xs text-gray-600">Ascent Retechno India Pvt Ltd</p>
              <p className="text-xs text-gray-600">
                Shop No.04, 05, 06 & 07 AV Crystal, Near Navneet Hospital, Opp. Achole Talav, Nallasopara East, Palghar, Maharashtra - 401209.
              </p>
              <a
                href="mailto:owegonline@oweg.in"
                className="inline-flex items-center gap-2 text-emerald-700 text-sm font-semibold"
                onClick={closeProfile}
              >
                <Mail className="w-4 h-4" />
                owegonline@oweg.in
              </a>
              <div className="flex gap-6">
                <a href="#" className="icon-link" aria-label="Facebook">
                  <Facebook className="h-5 w-5" />
                </a>
                <a href="#" className="icon-link" aria-label="Twitter">
                  <Twitter className="h-5 w-5" />
                </a>
                <a href="#" className="icon-link" aria-label="Instagram">
                  <Instagram className="h-5 w-5" />
                </a>
                <a href="#" className="icon-link" aria-label="LinkedIn">
                  <Linkedin className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>

          {customer ? (
            <button
              type="button"
              onClick={async () => {
                await logout();
                setProfileOpen(false);
                router.refresh();
              }}
              className="w-full rounded-xl bg-red-50 text-red-600 border border-red-100 px-4 py-3 flex items-center justify-center gap-2 font-semibold"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          ) : null}
        </div>
      </Overlay>

      {/* Join sheet */}
      <Overlay open={joinOpen} onClose={closeJoin}>
        <div className="p-4 pt-12 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              {/* <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-600">Grow with us</p> */}
              <h3 className="text-lg font-semibold text-gray-900">Join OWEG</h3>
              <p className="text-xs text-gray-500">Pick how you want to partner - vendor store or agent/partner track.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-600 via-lime-500 to-emerald-500 text-white p-4 shadow-lg space-y-3">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-white/15 p-2">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Launch your shop</p>
                <p className="text-xs text-white/80">List products, manage orders, and collect payouts with guidance.</p>
              </div>
            </div>
            <Link
              href="/vendor-portal"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-emerald-700 font-semibold px-4 py-2 shadow-sm"
              onClick={closeJoin}
            >
              Start as Vendor
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-50 text-emerald-700 p-2">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Agent / Partner</p>
                <p className="text-xs text-gray-600">Refer customers, earn rewards, and help nearby shoppers.</p>
              </div>
            </div>
            <a
              href="mailto:owegonline@oweg.in?subject=Join%20OWEG%20as%20Agent%20or%20Partner"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 text-emerald-700 font-semibold px-4 py-2 hover:bg-emerald-50"
              onClick={closeJoin}
            >
              Talk to team
              <Phone className="w-4 h-4" />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 flex items-center gap-3">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Serve nearby</p>
                <p className="text-[11px] text-gray-600">Hyperlocal delivery + COD.</p>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 flex items-center gap-3">
              
              <div>
                <p className="text-sm font-semibold text-gray-900">App-like UX</p>
                <p className="text-[11px] text-gray-600">Keep shopping without switching tabs.</p>
              </div>
            </div>
          </div>
        </div>
      </Overlay>
    </>
  );
}
