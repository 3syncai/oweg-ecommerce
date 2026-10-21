"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import BrandLoader from "@/components/ui/BrandLoader";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useStoreCategories } from "@/hooks/useStoreCategories";
import {
  ChevronRight,
  Heart,
  Home,
  User,
  X,
  ChevronsLeft,
  LayoutGrid,
  SlidersHorizontal,
  ImageOff,
  ShoppingCart,
  Search,
} from "lucide-react";
import type { MedusaCategory } from "@/lib/medusa";
import { useAuth } from "@/contexts/AuthProvider";
import { getOriginalImageUrl } from "@/lib/image-utils";
import CategoryIcon from "@/components/ui/icons/CategoryIcon";
import CategoryIconTile from "@/components/ui/icons/CategoryIconTile";
import MobileProfileSheet from "@/components/mobile/MobileProfileSheet";
import { buildLoginUrl, buildSignupUrl } from "@/lib/auth-redirect";
import navStyles from "./MobileBottomNav.module.css";
import { useCartSummary } from "@/contexts/CartProvider";

function CategoryProductImage({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={navStyles.productImage}>
      {src && !failed ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes="(max-width: 480px) 45vw, 240px"
          className="object-contain p-3"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={navStyles.imagePlaceholder}>
          <ImageOff size={28} strokeWidth={1.3} aria-hidden="true" />
          <span>Image unavailable</span>
        </div>
      )}
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
  (title || "")
    .toString()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");

const buildCategoryList = (data?: unknown): MobileCategory[] => {
  const raw: MedusaCategory[] = Array.isArray(
    (data as { categories?: MedusaCategory[] })?.categories,
  )
    ? ((data as { categories?: MedusaCategory[] })
        .categories as MedusaCategory[])
    : [];
  return raw.map((cat, idx) => {
    const baseId = cat.id || cat.handle || cat.title || `cat-${idx}`;
    return {
      id: baseId,
      title: (cat.title || cat.name || "Category").toString(),
      handle: cat.handle || undefined,
      image:
        (
          cat as MedusaCategory & {
            metadata?: { thumbnail?: string; image?: string };
          }
        ).metadata?.thumbnail ||
        (
          cat as MedusaCategory & {
            metadata?: { thumbnail?: string; image?: string };
          }
        ).metadata?.image ||
        undefined,
      children: Array.isArray(cat.category_children)
        ? cat.category_children.map((child, cIdx) => ({
            id:
              child.id ||
              child.handle ||
              child.title ||
              `${baseId}-child-${cIdx}`,
            title: (child.title || child.name || "Category").toString(),
            handle: child.handle || undefined,
          }))
        : [],
    };
  });
};

type InlineProduct = {
  id: string;
  name: string;
  image?: string;
  price?: number;
  mrp?: number;
  discount?: number;
  brand?: string;
};

const resolveProductImage = (p: ProductLike): string => {
  const candidates: Array<string | undefined | null> = [];
  candidates.push(p?.image);
  candidates.push(p?.thumbnail);
  if (Array.isArray(p?.images)) {
    p.images.forEach((img) => {
      if (!img) return;
      if (typeof img === "string") {
        candidates.push(img);
        return;
      }
      candidates.push(
        (img as { url?: string | null; original_url?: string | null })
          .original_url,
      );
      const urlVal = (img as { url?: string | null }).url;
      if (typeof urlVal === "string") candidates.push(urlVal);
    });
  }
  if (Array.isArray(p?.variants)) {
    p.variants.forEach((v) => {
      if (!v) return;
      candidates.push((v as { thumbnail?: string | null }).thumbnail);
      if (
        Array.isArray(
          (
            v as {
              images?: Array<{
                url?: string | null;
                original_url?: string | null;
              } | null> | null;
            }
          ).images,
        )
      ) {
        (
          v as {
            images?: Array<{
              url?: string | null;
              original_url?: string | null;
            } | null> | null;
          }
        ).images!.forEach((img) => {
          if (!img) return;
          candidates.push(img.original_url);
          const urlVal = (img as { url?: string | null }).url;
          if (typeof urlVal === "string") candidates.push(urlVal);
        });
      }
    });
  }
  const meta = (p?.metadata || {}) as Record<string, unknown>;
  ["image", "thumbnail", "img", "picture", "photo", "image_url", "url"].forEach(
    (key) => {
      const val = meta[key] as string | undefined;
      if (typeof val === "string") candidates.push(val);
    },
  );
  const metaImages = meta.images;
  if (Array.isArray(metaImages)) {
    metaImages.forEach((item) => {
      if (typeof item === "string") candidates.push(item);
      if (item && typeof item === "object" && "url" in item) {
        candidates.push((item as { url?: string }).url);
      }
    });
  }

  const pick =
    candidates.find((c) => typeof c === "string" && c.trim().length > 0) || "";
  if (!pick) return "/oweg_logo.png";
  const normalized = getOriginalImageUrl(pick.trim());
  if (normalized.startsWith("http://") || normalized.startsWith("https://"))
    return normalized;
  if (normalized.startsWith("/")) {
    if (typeof window !== "undefined") {
      return new URL(normalized, window.location.origin).href;
    }
  }
  return normalized || "/oweg_logo.png";
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
  if (typeof brand === "string" && brand.trim()) return brand.trim();
  const tagBrand = Array.isArray(p.tags)
    ? p.tags
        .map((t) => (typeof t === "string" ? t : t?.value || t?.handle || ""))
        .map((s) => s.trim())
        .find((s) => s.length > 0)
    : "";
  if (tagBrand) return tagBrand;
  return "";
};

const formatCurrency = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `â‚¹${Math.round(value)}`;
  }
};

const Overlay = ({
  open,
  onClose,
  children,
  scrollable = true,
  panelClassName = "bg-white",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  scrollable?: boolean;
  panelClassName?: string;
}) => (
  <div
    className={`fixed inset-0 z-[800] md:hidden transition-opacity duration-200 ${
      open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
    }`}
    onClick={onClose}
  >
    <div
      className={`absolute inset-x-0 top-0 bottom-0 transition-transform duration-200 ${
        open ? "translate-y-0" : "translate-y-full"
      } shadow-[0_-6px_30px_-20px_rgba(0,0,0,0.35)] border-t border-[var(--oweg-border)] overflow-hidden ${panelClassName}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`h-full ${scrollable ? "overflow-y-auto" : "overflow-hidden"} px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+160px)]`}
      >
        {children}
      </div>
    </div>
  </div>
);

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { customer, logout } = useAuth();
  const { count: cartCount } = useCartSummary();
  const [storedPincode, setStoredPincode] = useState("");
  const resetPanels = useCallback(() => {
    setCategoryOpen(false);
    setProfileOpen(false);
  }, []);
  const wishlistCount = useMemo(() => {
    const list = (customer?.metadata as Record<string, unknown> | undefined)
      ?.wishlist;
    if (Array.isArray(list)) return list.length;
    return 0;
  }, [customer?.metadata]);
  const { data: categoryData, isLoading: categoriesLoading } = useStoreCategories();
  const categories = useMemo(
    () => buildCategoryList({ categories: categoryData }),
    [categoryData],
  );
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const categoryContentRef = useRef<HTMLDivElement>(null);
  const categoryScrollPositions = useRef<Record<string, number>>({});
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [selectedSubcategory, setSelectedSubcategory] =
    useState<MobileCategory | null>(null);
  const [subProducts, setSubProducts] = useState<InlineProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [priceSort, setPriceSort] = useState<"none" | "asc" | "desc">("none");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sidebarOverlayOpen, setSidebarOverlayOpen] = useState(false);
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const lastCategoryIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedSubcategory) {
      setSidebarOverlayOpen(false);
    }
  }, [selectedSubcategory]);
  useEffect(() => {
    if (!categoryOpen) return;
    setSidebarOverlayOpen(false);
    setExpandedCatId(null);
  }, [categoryOpen]);

  useEffect(() => {
    const openCategories = () => {
      setProfileOpen(false);
      setCategoryOpen(true);
    };
    window.addEventListener("oweg:open-mobile-categories", openCategories);
    return () => {
      window.removeEventListener("oweg:open-mobile-categories", openCategories);
    };
  }, []);
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
      setSidebarOverlayOpen(false);
      lastCategoryIdRef.current = selectedCategoryId;
    }
  }, [selectedCategoryId, sidebarOverlayOpen]);
  const closeCategory = () => {
    setCategoryOpen(false);
    setSearchTerm("");
    setCategorySearch("");
  };
  const closeProfile = () => setProfileOpen(false);
  const overlayOpen = categoryOpen || profileOpen;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = overlayOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [overlayOpen]);

  // stop auto-selecting first category so products show only after user taps
  useEffect(() => {
    if (!categoryOpen) {
      setSelectedCategoryId(null);
      setSelectedSubcategory(null);
    }
  }, [categoryOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const setClass = (cond: boolean, cls: string) => {
      if (cond) document.body.classList.add(cls);
      else document.body.classList.remove(cls);
    };
    setClass(categoryOpen, "category-overlay-open");
    setClass(profileOpen, "profile-overlay-open");
    return () => {
      document.body.classList.remove(
        "category-overlay-open",
        "profile-overlay-open",
      );
    };
  }, [categoryOpen, profileOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pin = window.localStorage.getItem("oweg_pincode") || "";
    setStoredPincode(pin);
  }, [overlayOpen, pathname]);

  useEffect(() => {
    resetPanels();
  }, [pathname, resetPanels]);

  // Prefetch key routes/data so bottom nav taps feel instant
  useEffect(() => {
    router.prefetch("/account");
    router.prefetch("/account/orders");
    router.prefetch("/wishlist");
    router.prefetch("/");
    router.prefetch("/vendor-portal");
    router.prefetch("/login");
    router.prefetch("/signup");
  }, [router]);

  const categoriesWithChildren = useMemo(
    () =>
      categories.filter(
        (cat) => Array.isArray(cat.children) && cat.children.length > 0,
      ),
    [categories],
  );

  useEffect(() => {
    if (!categoryOpen) return;
    if (selectedCategoryId) return;
    const preferred = categoriesWithChildren.find(
      (c) => normalizeCategoryKey(c.title) === "home-appliances",
    );
    const fallback = categoriesWithChildren[0];
    const target = preferred || fallback;
    if (target) {
      setSelectedCategoryId(target.id);
      setSelectedSubcategory(null);
    }
  }, [categoryOpen, categoriesWithChildren, selectedCategoryId]);

  const filteredCategories = useMemo(() => {
    const term = categorySearch.trim().toLowerCase();
    if (selectedSubcategory || !term) return categoriesWithChildren;
    return categoriesWithChildren.filter(cat => cat.title.toLowerCase().includes(term) ||
      cat.children?.some(child => child.title.toLowerCase().includes(term)));
  }, [categoriesWithChildren, categorySearch, selectedSubcategory]);

  const displayedCategory = useMemo(() =>
    filteredCategories.find(c => c.id === selectedCategoryId) || filteredCategories[0] || null,
    [filteredCategories, selectedCategoryId]);

  useEffect(() => {
    if (categoryContentRef.current && !selectedSubcategory) {
      categoryContentRef.current.scrollTop = categorySearch ? 0 :
        categoryScrollPositions.current[displayedCategory?.id || ""] || 0;
    }
  }, [displayedCategory?.id, categoryOpen, selectedSubcategory, categorySearch]);

  const activeCategory = displayedCategory;

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
              : "";
        if (!query) {
          setSubProducts([]);
          setProductsLoading(false);
          return;
        }
        const res = await fetch(`/api/medusa/products?${query}&limit=24`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setSubProducts([]);
        } else {
          const data = await res.json();
          const productArray: ProductLike[] = Array.isArray(data?.products)
            ? (data.products as ProductLike[])
            : [];
          const products = productArray.map((p) => {
            const brand = getProductBrand(p);
            return {
              id: String(p.id || p.handle || Math.random()),
              name: p.title || p.name || "Product",
              image: resolveProductImage(p),
              price: typeof p.price === "number" ? p.price : undefined,
              mrp: typeof p.mrp === "number" ? p.mrp : undefined,
              discount: typeof p.discount === "number" ? p.discount : undefined,
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
      list = list.filter(
        (p) => (p.brand || "").toLowerCase() === brandFilter.toLowerCase(),
      );
    }
    if (Number.isFinite(min)) {
      list = list.filter(
        (p) =>
          typeof p.price === "number" && (p.price as number) >= (min as number),
      );
    }
    if (Number.isFinite(max)) {
      list = list.filter(
        (p) =>
          typeof p.price === "number" && (p.price as number) <= (max as number),
      );
    }
    if (priceSort === "asc") {
      list = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (priceSort === "desc") {
      list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
    }
    return list;
  }, [
    subProducts,
    brandFilter,
    priceMin,
    priceMax,
    priceSort,
    searchTerm,
    selectedSubcategory,
  ]);

  useEffect(() => {
    const brands = Array.from(
      new Set(
        subProducts
          .map((p) => p.brand || "")
          .map((b) => b.trim())
          .filter((b) => b.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));
    setAvailableBrands(brands);
    if (brands.length === 0) {
      setBrandFilter("");
    } else if (brandFilter && !brands.includes(brandFilter)) {
      setBrandFilter("");
    }
  }, [subProducts, brandFilter]);

  const iconSize = "w-[22px] h-[22px]";
  const _fetchPrefProducts = useCallback(
    async (query: {
      tag?: string;
      type?: string;
      category?: string;
      limit?: number;
    }) => {
      const params = new URLSearchParams();
      if (query.tag) params.set("tag", query.tag);
      if (query.type) params.set("type", query.type);
      if (query.category) params.set("category", query.category);
      params.set("limit", String(query.limit ?? 12));
      const res = await fetch(`/api/medusa/products?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Unable to load products");
      const data = await res.json();
      return Array.isArray(data?.products) ? data.products : [];
    },
    [],
  );
  const navActiveKey = profileOpen
    ? "profile"
    : categoryOpen || pathname?.startsWith("/c/")
      ? "categories"
      : pathname === "/cart" || pathname === "/checkout"
        ? "cart"
    : pathname?.startsWith("/account/wishlist") ||
        pathname?.startsWith("/wishlist")
      ? "wishlist"
      : pathname?.startsWith("/account")
        ? "profile"
        : pathname === "/"
          ? "home"
          : null;
  const navItems = [
    {
      key: "home",
      label: "Home",
      href: "/",
      icon: <Home className={iconSize} />,
    },
    {
      key: "categories",
      label: "Categories",
      href: undefined,
      icon: <LayoutGrid className={iconSize} />,
    },
    {
      key: "cart",
      label: "Cart",
      href: "/cart",
      badge: cartCount,
      icon: <ShoppingCart className={iconSize} />,
    },
    {
      key: "wishlist",
      label: "Wishlist",
      href: "/wishlist",
      badge: wishlistCount,
      icon: <Heart className={iconSize} />,
      prefetchKey: "wishlist",
    },
    {
      key: "profile",
      label: "Account",
      href: "/account",
      icon: <User className={iconSize} />,
    },
  ];

  const customerName = useMemo(() => {
    if (!customer) return "";
    const first =
      typeof customer.first_name === "string" ? customer.first_name.trim() : "";
    const last =
      typeof customer.last_name === "string" ? customer.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    if (full) return full;
    if (customer.email) {
      const [local] = customer.email.split("@");
      return local || customer.email;
    }
    return "Account";
  }, [customer]);
  const deliverLocation = useMemo(() => {
    const metaPlace =
      (
        customer?.metadata as
          | { place_name?: string; location?: string }
          | undefined
      )?.place_name ||
      (customer?.metadata as { location?: string } | undefined)?.location;
    const firstAddress = Array.isArray(customer?.shipping_addresses)
      ? (customer?.shipping_addresses[0] as
          | { city?: string; country?: string }
          | undefined)
      : undefined;
    const addressCity = firstAddress?.city || firstAddress?.country;
    return metaPlace || addressCity || storedPincode || "Set your location";
  }, [customer?.metadata, customer?.shipping_addresses, storedPincode]);

  const goNav = (href: string) => {
    resetPanels();
    router.push(href);
  };

  const prefetchWishlist = () => {
    if (!customer?.id) return;
    void queryClient.prefetchQuery({
      queryKey: ["wishlist", customer.id],
      queryFn: async () => {
        const res = await fetch("/api/medusa/wishlist", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Unable to load wishlist");
        const data = await res.json();
        return Array.isArray(data?.products) ? data.products : [];
      },
      staleTime: 1000 * 60 * 2,
    });
  };

  return (
    <>
      <nav
        aria-label="Primary"
        className={navStyles.bottomNav}
      >
        <div className={navStyles.dock}>
          {navItems.map((item) => {
            const active = navActiveKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={navStyles.item}
                data-active={active}
                onMouseEnter={() => {
                  if (item.prefetchKey === "wishlist") prefetchWishlist();
                }}
                onFocus={() => {
                  if (item.prefetchKey === "wishlist") {
                    void router.prefetch("/wishlist");
                  }
                }}
                onClick={(e) => {
                  e.preventDefault();
                  if (item.key === "categories") {
                    setProfileOpen(false);
                    setCategoryOpen(true);
                    return;
                  }
                  if (item.key === "profile") {
                    setCategoryOpen(false);
                    setProfileOpen(true);
                    return;
                  }
                  if (item.href) goNav(item.href);
                }}
              >
                <span className={navStyles.icon}>
                  {item.icon}
                  {item.badge ? (
                    <span className={navStyles.badge}>
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span className={navStyles.label}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Category sheet */}
      <Overlay open={categoryOpen} onClose={closeCategory} scrollable={false} panelClassName={`bg-white ${navStyles.categoryPanel}`}>
        <div className={`${navStyles.categorySheet} relative`}>
          {(
            <>
              <div className={navStyles.directoryHeader}>
                <div><p className={navStyles.directoryEyebrow}>FIND YOUR NEXT FAVOURITE</p><h2>Shop by category</h2></div>
                <button type="button" aria-label="Close categories" onClick={closeCategory} className={navStyles.directoryClose}><X size={20} /></button>
              </div>
              {!selectedSubcategory && <div className={navStyles.directorySearch}>
                <Search size={18} aria-hidden="true" />
                <input aria-label="Find a category" placeholder="Find a category" value={categorySearch} onChange={event => setCategorySearch(event.target.value)} />
                {categorySearch && <button type="button" aria-label="Clear category search" onClick={() => setCategorySearch("")}><X size={16} /></button>}
              </div>}
            </>
          )}

          {categoriesLoading && (
            <div className="grid grid-cols-2 gap-3 pt-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={`cat-skeleton-${idx}`}
                  className="rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-3 shadow-sm"
                >
                  <div className="h-16 w-full rounded-xl bg-white" />
                  <div className="h-4 w-3/4 rounded bg-white/80" />
                  <div className="h-3 w-1/2 rounded bg-white/60" />
                </div>
              ))}
            </div>
          )}

          {selectedSubcategory && sidebarOverlayOpen && (
            <div
              className={navStyles.drawerBackdrop}
              onClick={() => setSidebarOverlayOpen(false)}
            >
              <div
                className={navStyles.categoryDrawer}
                aria-label="Browse categories"
                onClick={(e) => e.stopPropagation()}
              >
                <div className={navStyles.drawerHeader}>
                  <div><p className={navStyles.drawerEyebrow}>FIND YOUR NEXT FAVOURITE</p><h4>Shop by category</h4></div>
                  <button
                    type="button"
                    onClick={() => setSidebarOverlayOpen(false)}
                    className={navStyles.drawerClose}
                    aria-label="Close category browser"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className={navStyles.drawerList}>
                  {filteredCategories.map((cat) => {
                    const active = displayedCategory?.id === cat.id;
                    const isExpanded = expandedCatId === cat.id;
                    const hasChildren =
                      Array.isArray(cat.children) && cat.children.length > 0;
                    return (
                      <div
                        key={cat.id}
                        className={navStyles.drawerGroup}
                        data-active={active || undefined}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategoryId(cat.id);
                            setSelectedSubcategory(null);
                            if (hasChildren) {
                              setExpandedCatId(cat.id);
                              setSidebarOverlayOpen(true);
                            } else {
                              setExpandedCatId(null);
                              setSidebarOverlayOpen(false);
                            }
                          }}
                          className={navStyles.drawerCategory}
                          aria-expanded={hasChildren ? isExpanded : undefined}
                          title={cat.title}
                        >
                          <CategoryIconTile
                            handle={cat.handle}
                            title={cat.title}
                            active={active}
                            size="sm"
                            orientation="horizontal"
                            labelWrap
                            className="min-w-0 flex-1"
                            labelClassName={navStyles.drawerCategoryLabel}
                          />
                          {hasChildren ? (
                            <ChevronRight
                              className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            />
                          ) : null}
                        </button>
                        {hasChildren && isExpanded ? (
                          <div className={navStyles.drawerChildren}>
                            {cat.children!.map((child) => (
                              <button
                                key={child.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCategoryId(cat.id);
                                  setSelectedSubcategory(child);
                                    setSidebarOverlayOpen(false);
                                }}
                                className={navStyles.drawerChild}
                                aria-current={selectedSubcategory.id === child.id ? "true" : undefined}
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
            className={`${navStyles.categoryBody} relative min-h-0 transition-all duration-300 ease-in-out ${selectedSubcategory ? "" : "flex gap-3"}`}
          >
            {!selectedSubcategory && (
              <nav className={navStyles.departmentRail} aria-label="Departments">
                {categoriesLoading ? <p className={navStyles.directoryMessage}>Loading…</p> : filteredCategories.map(cat => {
                  const active = displayedCategory?.id === cat.id;
                  return <button key={cat.id} type="button" className={navStyles.department} aria-pressed={active} onClick={() => { setSelectedCategoryId(cat.id); setSelectedSubcategory(null); }}>
                    <CategoryIcon handle={cat.handle} title={cat.title} active={active} className="h-7 w-7" />
                    <span>{cat.title}</span>
                  </button>;
                })}
              </nav>
            )}

            <div
              ref={categoryContentRef}
              onScroll={event => { if (!selectedSubcategory && displayedCategory && !categorySearch) categoryScrollPositions.current[displayedCategory.id] = event.currentTarget.scrollTop; }}
              className={`${navStyles.categoryScroll} ${selectedSubcategory ? "w-full" : "flex-1 min-w-0"} h-full min-h-0 overflow-y-auto pr-1 transition-all duration-300 ease-in-out`}
            >
              <div className="space-y-3">
                <>
                    {!selectedSubcategory && displayedCategory && (
                      <section className={navStyles.directorySection} aria-label={displayedCategory.title}>
                        <div className={navStyles.departmentHeading}>
                          <div><h3>{displayedCategory.title}</h3><p>Explore the collection</p></div>
                          <Link href={`/c/${encodeURIComponent(displayedCategory.handle || displayedCategory.id)}`} onClick={closeCategory}>Shop all <ChevronRight size={14} aria-hidden="true" /></Link>
                        </div>
                        <ul className={navStyles.subcategoryGrid}>
                          {(displayedCategory.children || []).filter(child => !categorySearch.trim() || displayedCategory.title.toLowerCase().includes(categorySearch.trim().toLowerCase()) || child.title.toLowerCase().includes(categorySearch.trim().toLowerCase())).map(child => (
                            <li key={child.id}>
                              <button type="button" className={navStyles.subcategoryTile} onClick={() => { setSelectedCategoryId(displayedCategory.id); setSelectedSubcategory(child); }}>
                                <CategoryIconTile kind="subcategory" handle={child.handle} title={child.title} size="md" showLabel={false} />
                                <span>{child.title}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {!(displayedCategory.children || []).length && <p className={navStyles.directoryMessage}>Discover everything in {displayedCategory.title} using Shop all.</p>}
                      </section>
                    )}
                    {!selectedSubcategory && !displayedCategory && !categoriesLoading && <div className={navStyles.directoryMessage}><strong>No matching categories</strong><p>Try a different name, such as kettle or kitchen.</p><button type="button" onClick={() => setCategorySearch("")}>Clear search</button></div>}

                    {selectedSubcategory && (
                      <div className={navStyles.resultsHeader}>
                        <div className={navStyles.resultsToolbar}>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label="Show categories"
                              onClick={() => {
                                setSidebarOverlayOpen(true);
                                lastCategoryIdRef.current = selectedCategoryId;
                              }}
                              className={navStyles.categorySwitch}
                            >
                              <ChevronsLeft className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSubcategory(null);
                                setSidebarOverlayOpen(false);
                              }}
                              className={navStyles.backLink}
                            >
                              <ChevronRight className="w-3 h-3 rotate-180" />
                              All subcategories
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className={navStyles.filterToggle}
                              aria-expanded={filtersOpen}
                              aria-controls="mobile-category-filters"
                              onClick={() => setFiltersOpen((v) => !v)}
                            >
                              <SlidersHorizontal className="h-4 w-4" />
                              Filters
                              <ChevronRight
                                className={`w-3 h-3 text-gray-400 transition-transform ${filtersOpen ? "rotate-90" : ""}`}
                              />
                            </button>
                          </div>
                        </div>
                        <div className={navStyles.categoryHeading}>
                          {activeCategory ? (
                            <p className={navStyles.categoryEyebrow}>{activeCategory.title}</p>
                          ) : null}
                          <div className={navStyles.categoryTitleRow}>
                            <h3>{selectedSubcategory.title}</h3>
                            <span className={navStyles.resultCount} aria-live="polite">
                              {productsLoading ? "Loading…" : `${filteredProducts.length} products`}
                            </span>
                          </div>
                        </div>
                        {filtersOpen && (
                          <div id="mobile-category-filters" className={navStyles.filterPanel}>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-700 font-semibold">
                                Sort:
                              </span>
                              <select
                                aria-label="Sort products"
                                value={priceSort}
                                onChange={(e) =>
                                  setPriceSort(
                                    e.target.value as "none" | "asc" | "desc",
                                  )
                                }
                                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                              >
                                <option value="none">Default</option>
                                <option value="asc">Price: Low to High</option>
                                <option value="desc">Price: High to Low</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-700 font-semibold">
                                Brand:
                              </span>
                              <select
                                aria-label="Filter by brand"
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
                              <span className="text-gray-700 font-semibold">
                                Price:
                              </span>
                              <input
                                type="number"
                                inputMode="numeric"
                                aria-label="Minimum price"
                                placeholder="Min"
                                value={priceMin}
                                onChange={(e) => setPriceMin(e.target.value)}
                                className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                              />
                              <span aria-hidden="true">&ndash;</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                aria-label="Maximum price"
                                placeholder="Max"
                                value={priceMax}
                                onChange={(e) => setPriceMax(e.target.value)}
                                className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                              />
                            </div>
                            {(priceSort !== "none" ||
                              brandFilter ||
                              priceMin ||
                              priceMax) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPriceSort("none");
                                  setBrandFilter("");
                                  setPriceMin("");
                                  setPriceMax("");
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
                      <div className={navStyles.productGrid} aria-busy={productsLoading}>
                        {productsLoading ? (
                          <div className="col-span-2">
                            <BrandLoader compact label="Finding your products…" />
                          </div>
                        ) : filteredProducts.length === 0 ? (
                          <div className={navStyles.resultMessage}>
                            <SlidersHorizontal size={24} aria-hidden="true" />
                            <strong>No products found</strong>
                            <span>Try another brand or price range.</span>
                          </div>
                        ) : (
                          filteredProducts.map((p) => (
                            <Link
                              key={p.id}
                              href={`/productDetail/${encodeURIComponent(p.id)}?id=${encodeURIComponent(p.id)}`}
                              className={navStyles.productCard}
                              onClick={closeCategory}
                            >
                              <CategoryProductImage key={p.image} src={p.image} name={p.name} />
                              <div className={navStyles.productInfo}>
                                <p className={navStyles.productName}>{p.name}</p>
                                <div className={navStyles.productPrice}>
                                  <strong>{formatCurrency(p.price)}</strong>
                                  {p.mrp && p.mrp > (p.price || 0) ? (
                                    <del>{formatCurrency(p.mrp)}</del>
                                  ) : null}
                                </div>
                                {p.mrp && p.mrp > (p.price || 0) ? (
                                  <span className={navStyles.productSaving}>
                                    Save {formatCurrency(p.mrp - (p.price || 0))}
                                  </span>
                                ) : null}
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    ) : null}
                  </>
              </div>
            </div>
          </div>
        </div>
      </Overlay>

      {/* Profile sheet */}
      <Overlay
        open={profileOpen}
        onClose={closeProfile}
        panelClassName="bg-[var(--oweg-surface-subtle)]"
      >
        <MobileProfileSheet
          customer={customer}
          customerName={customerName}
          deliverLocation={deliverLocation}
          onClose={closeProfile}
          onLogin={() => {
            closeProfile();
            router.push(buildLoginUrl(pathname));
          }}
          onSignup={() => {
            closeProfile();
            router.replace(buildSignupUrl(pathname));
          }}
          onSignOut={async () => {
            await logout();
            setProfileOpen(false);
            router.refresh();
          }}
        />
      </Overlay>
    </>
  );
}
