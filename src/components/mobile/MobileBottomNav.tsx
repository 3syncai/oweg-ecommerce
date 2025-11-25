'use client';

import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
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
  LogOut,
  MapPin,
  Phone,
  Shield,
  ShoppingBag,
  Sparkles,
  Store,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import type { MedusaCategory } from '@/lib/medusa';
import { useAuth } from '@/contexts/AuthProvider';

type MobileCategory = {
  id: string;
  title: string;
  handle?: string;
  image?: string;
  children?: MobileCategory[];
};

const buildCategoryList = (data?: unknown): MobileCategory[] => {
  const raw: MedusaCategory[] = Array.isArray((data as { categories?: MedusaCategory[] })?.categories)
    ? ((data as { categories?: MedusaCategory[] }).categories as MedusaCategory[])
    : [];
  return raw.slice(0, 12).map((cat) => ({
    id: cat.id || cat.handle || cat.title || Math.random().toString(),
    title: (cat.title || cat.name || 'Category').toString(),
    handle: cat.handle || undefined,
    image:
      (cat as MedusaCategory & { metadata?: { thumbnail?: string; image?: string } }).metadata?.thumbnail ||
      (cat as MedusaCategory & { metadata?: { thumbnail?: string; image?: string } }).metadata?.image ||
      undefined,
    children: Array.isArray(cat.category_children)
      ? cat.category_children.map((child) => ({
          id: child.id || child.handle || child.title || Math.random().toString(),
          title: (child.title || child.name || 'Category').toString(),
          handle: child.handle || undefined,
        }))
      : [],
  }));
};

const Overlay = ({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) => (
  <div
    className={`fixed inset-0 z-[110] md:hidden transition-opacity duration-200 ${
      open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
    }`}
    onClick={onClose}
  >
    <div
      className={`absolute inset-x-0 top-0 bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] bg-white transition-transform duration-200 ${
        open ? 'translate-y-0' : 'translate-y-full'
      } shadow-[0_-6px_30px_-20px_rgba(0,0,0,0.35)] rounded-t-2xl border-t border-gray-100 overflow-hidden`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="h-full overflow-y-auto px-4 pt-[132px] pb-[calc(170px+env(safe-area-inset-bottom,0px))]">
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
    queryKey: ['mobile-bottom-nav-categories'],
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
  const [activeCategory, setActiveCategory] = useState<MobileCategory | null>(null);
  const closeCategory = () => {
    setCategoryOpen(false);
    setActiveCategory(null);
    setSearchTerm('');
  };
  const closeProfile = () => setProfileOpen(false);
  const closeJoin = () => setJoinOpen(false);
  const setFirstCategory = useCallback(() => {
    if (categories.length && !activeCategory) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  const overlayOpen = categoryOpen || profileOpen || joinOpen;
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = overlayOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [overlayOpen]);

  useEffect(() => {
    if (categoryOpen) {
      setFirstCategory();
    }
  }, [categoryOpen, setFirstCategory, categories.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pin = window.localStorage.getItem('oweg_pincode') || '';
    setStoredPincode(pin);
  }, [overlayOpen, pathname]);

  useEffect(() => {
    resetPanels();
  }, [pathname, resetPanels]);

  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return categories;
    const term = searchTerm.toLowerCase();
    return categories.filter((cat) => cat.title.toLowerCase().includes(term));
  }, [categories, searchTerm]);

  const navItems = [
    {
      key: 'home',
      label: 'Home',
      href: '/',
      icon: <Home className="w-5 h-5" />,
      active: pathname === '/',
    },
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
      <div className="fixed inset-x-0 bottom-0 z-[1400] md:hidden bg-white/98 backdrop-blur border-t border-gray-200 shadow-[0_-10px_30px_-18px_rgba(0,0,0,0.45)] rounded-t-3xl">
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
      <Overlay open={categoryOpen} onClose={closeCategory}>
        <div className="p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Browse</p>
              <h3 className="text-lg font-semibold text-gray-900">Categories</h3>
              <p className="text-xs text-gray-500">Tap a category to view its sub-categories.</p>
            </div>
          </div>

          <div className="relative">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search categories"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <Sparkles className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {categoriesLoading ? (
              <div className="col-span-3 text-sm text-gray-500">Loading categories…</div>
            ) : (
              filteredCategories.map((cat) => (
                <div
                  key={cat.id}
                  className={`group rounded-2xl border ${
                    activeCategory?.id === cat.id ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 bg-white'
                  } shadow-sm overflow-hidden text-left flex flex-col`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className="text-left flex-1"
                  >
                    <div className="relative aspect-square w-full">
                      {cat.image ? (
                        <Image src={cat.image} alt={cat.title} fill sizes="33vw" className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-50 to-lime-50 text-emerald-600 font-semibold text-xs">
                          {cat.title.slice(0, 10)}
                        </div>
                      )}
                    </div>
                    <div className="px-3 pt-2">
                      <p className="text-sm font-semibold text-gray-900 line-clamp-2">{cat.title}</p>
                    </div>
                  </button>
                  <Link
                    href={cat.handle ? `/c/${encodeURIComponent(cat.handle)}` : '#'}
                    className="px-3 pb-3 text-[11px] text-emerald-700 inline-flex items-center gap-1 font-semibold"
                    onClick={closeCategory}
                  >
                    Open category
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              ))
            )}
          </div>

          {activeCategory && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-600">Sub-categories</p>
                  <p className="text-sm font-semibold text-emerald-800">{activeCategory.title}</p>
                </div>
                <Link
                  href={
                    activeCategory.handle ? `/c/${encodeURIComponent(activeCategory.handle)}` : '#'
                  }
                  className="text-xs font-semibold text-white bg-emerald-600 px-3 py-2 rounded-lg shadow hover:bg-emerald-700"
                  onClick={closeCategory}
                >
                  View all
                </Link>
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-hidden pb-1">
                {(activeCategory.children || []).length ? (
                  (activeCategory.children || []).map((child) => (
                    <Link
                      key={child.id}
                      href={child.handle ? `/c/${encodeURIComponent(child.handle)}` : '#'}
                      className="whitespace-nowrap rounded-full bg-white text-emerald-700 border border-emerald-200 px-3 py-1.5 text-xs font-semibold shadow-sm"
                      onClick={closeCategory}
                    >
                      {child.title}
                    </Link>
                  ))
                ) : (
                  <span className="text-xs text-emerald-700">No sub-categories listed</span>
                )}
              </div>
            </div>
          )}
        </div>
      </Overlay>

      {/* Profile sheet */}
      <Overlay open={profileOpen} onClose={closeProfile}>
        <div className="p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Profile</p>
              <h3 className="text-lg font-semibold text-gray-900">{customer ? `Hi, ${customerName}` : 'Welcome back'}</h3>
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
              <div className="flex gap-3 pt-1">
                {['Facebook', 'Twitter', 'Instagram', 'LinkedIn'].map((label) => (
                  <span key={label} className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-[11px] text-gray-600">
                    {label[0]}
                  </span>
                ))}
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
        <div className="p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-600">Grow with us</p>
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
              <Sparkles className="w-4 h-4 text-emerald-600" />
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
