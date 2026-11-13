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
import { ProductCard, type ProductCardProps } from "@/components/modules/ProductCard";
import { CategoryLink } from "@/components/modules/CategoryNavigation";
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
  ShoppingCart,
  Search,
} from "lucide-react";
import type { MedusaCategory } from "@/lib/medusa";
import { useDeliveryLocation } from "@/contexts/DeliveryLocationProvider";
import { useAuth } from "@/contexts/AuthProvider";
import CategoryIcon from "@/components/ui/icons/CategoryIcon";
import SubcategoryIcon from "@/components/ui/icons/SubcategoryIcon";
import { mobileCategoryArtwork } from "@/lib/mobile-category-artwork";
import MobileProfileSheet from "@/components/mobile/MobileProfileSheet";
import LogoutConfirmModal from "@/components/account/LogoutConfirmModal";
import { buildLoginUrl, buildSignupUrl } from "@/lib/auth-redirect";
import navStyles from "./MobileBottomNav.module.css";
import { useCartSummary } from "@/contexts/CartProvider";

type MobileCategory = {
  id: string;
  title: string;
  handle?: string;
  image?: string;
  children?: MobileCategory[];
};

function CategoryArtwork({ category, kind, className }: {
  category: MobileCategory;
  kind: "category" | "subcategory";
  className: string;
}) {
  const src = mobileCategoryArtwork(kind, category.handle, category.title);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const Icon = kind === "category" ? CategoryIcon : SubcategoryIcon;
  const size = kind === "category" ? 112 : 192;

  return (
    <span className={className} aria-hidden="true">
      {src && src !== failedSrc ? (
        <Image src={src} alt="" width={size} height={size} unoptimized loading="lazy"
          onError={() => setFailedSrc(src)} />
      ) : (
        <Icon handle={category.handle} title={category.title} className={navStyles.artworkFallback} />
      )}
    </span>
  );
}

const buildCategoryList = (data?: unknown): MobileCategory[] => {
  const raw: MedusaCategory[] = Array.isArray(
    (data as { categories?: MedusaCategory[] })?.categories,
  )
    ? ((data as { categories?: MedusaCategory[] })
        .categories as MedusaCategory[])
    : [];
  // The store API can return a child both at the top level and nested.
  const childIds = new Set(raw.flatMap(cat => (cat.category_children || []).map(child => child.id)));
  return raw.filter(cat => !cat.parent_category_id && !childIds.has(cat.id)).map((cat, idx) => {
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

type InlineProduct = ProductCardProps & { brand?: string };

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
    aria-hidden={!open}
    inert={!open}
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
  const { customer } = useAuth();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const { count: cartCount } = useCartSummary();
  const { pincode, place } = useDeliveryLocation();
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
  const { data: categoryData, isLoading: categoriesLoading, isError: categoriesError, refetch: refetchCategories } = useStoreCategories();
  const categories = useMemo(
    () => buildCategoryList({ categories: categoryData }),
    [categoryData],
  );
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const categoryContentRef = useRef<HTMLDivElement>(null);
  const categoryScrollPositions = useRef<Record<string, number>>({});
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [selectedSubcategory, setSelectedSubcategory] =
    useState<MobileCategory | null>(null);
  const [subProducts, setSubProducts] = useState<InlineProduct[]>([]);
  const [settledSubcategory, setSettledSubcategory] = useState<MobileCategory | null>(null);
  const [productsError, setProductsError] = useState(false);
  const [productsRetry, setProductsRetry] = useState(0);
  const productsLoading = selectedSubcategory !== null && selectedSubcategory !== settledSubcategory;
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

  const filteredCategories = useMemo(() => {
    const term = categorySearch.trim().toLowerCase();
    if (selectedSubcategory || !term) return categories;
    return categories.filter(cat => cat.title.toLowerCase().includes(term) ||
      cat.children?.some(child => child.title.toLowerCase().includes(term)));
  }, [categories, categorySearch, selectedSubcategory]);

  const displayedCategory = useMemo(() =>
    filteredCategories.find(c => c.id === selectedCategoryId) || filteredCategories[0] || null,
    [filteredCategories, selectedCategoryId]);

  useEffect(() => {
    if (categoryContentRef.current) {
      categoryContentRef.current.scrollTop = selectedSubcategory || categorySearch ? 0 :
        categoryScrollPositions.current[displayedCategory?.id || ""] || 0;
    }
  }, [displayedCategory?.id, categoryOpen, selectedSubcategory, categorySearch]);

  const activeCategory = displayedCategory;

  useEffect(() => {
    const target = selectedSubcategory;
    if (!target) {
      setSubProducts([]);
      setSettledSubcategory(null);
      return;
    }
    const controller = new AbortController();
    const fetchProducts = async () => {
      setProductsError(false);
      try {
        const query = new URLSearchParams({ limit: "24" });
        query.set(target.handle ? "category" : "categoryId", target.handle || target.id);
        const response = await fetch(`/api/medusa/products?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Could not load category products");
        const { products } = await response.json() as { products?: InlineProduct[] };
        if (!controller.signal.aborted) setSubProducts(Array.isArray(products) ? products : []);
      } catch {
        if (!controller.signal.aborted) {
          setSubProducts([]);
          setProductsError(true);
        }
      } finally {
        if (!controller.signal.aborted) setSettledSubcategory(target);
      }
    };
    void fetchProducts();
    return () => controller.abort();
  }, [selectedSubcategory, productsRetry]);

  useEffect(() => {
    setFiltersOpen(false);
  }, [selectedSubcategory, selectedCategoryId, categoryOpen]);

  const filteredProducts = useMemo(() => {
    let list = subProducts;
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
    return place || pincode || metaPlace || addressCity || "Set your location";
  }, [customer?.metadata, customer?.shipping_addresses, pincode, place]);

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
                data-cart-target={item.key === "cart" ? "" : undefined}
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
        {categoryOpen && <div className={`${navStyles.categorySheet} relative`}>
          {(
            <>
              <div className={navStyles.directoryHeader}>
                <h2>{selectedSubcategory ? "Browse products" : "All categories"}</h2>
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
                          <CategoryArtwork category={cat} kind="category" className={navStyles.drawerArtwork} />
                          <span className={navStyles.drawerCategoryLabel}>{cat.title}</span>
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
            className={`${navStyles.categoryBody} min-h-0 transition-all duration-300 ease-in-out ${productsLoading && !filtersOpen ? "" : "relative"} ${selectedSubcategory ? "" : "flex gap-3"}`}
          >
            {!selectedSubcategory && (
              <nav className={navStyles.departmentRail} aria-label="Departments">
                {categoriesLoading ? <p className={navStyles.directoryMessage}>Loading…</p> : filteredCategories.map(cat => {
                  const active = displayedCategory?.id === cat.id;
                  return <button key={cat.id} type="button" className={navStyles.department} aria-pressed={active} onClick={() => { setSelectedCategoryId(cat.id); setSelectedSubcategory(null); }}>
                    <CategoryArtwork category={cat} kind="category" className={navStyles.railArtwork} />
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
                          <div>
                            <h3>{displayedCategory.title}</h3>
                            <CategoryLink href={`/c/${encodeURIComponent(displayedCategory.handle || displayedCategory.id)}`} prefetch={false} onClick={closeCategory}>Shop all <ChevronRight size={14} aria-hidden="true" /></CategoryLink>
                          </div>
                          <CategoryArtwork category={displayedCategory} kind="category" className={navStyles.headingArtwork} />
                        </div>
                        {!!displayedCategory.children?.length && <h4 className={navStyles.subcategoryHeading}>Shop by subcategory</h4>}
                        <ul className={navStyles.subcategoryGrid}>
                          {(displayedCategory.children || []).filter(child => !categorySearch.trim() || displayedCategory.title.toLowerCase().includes(categorySearch.trim().toLowerCase()) || child.title.toLowerCase().includes(categorySearch.trim().toLowerCase())).map(child => (
                            <li key={child.id}>
                              <button type="button" className={navStyles.subcategoryTile} onClick={() => { setSelectedCategoryId(displayedCategory.id); setSelectedSubcategory(child); }}>
                                <CategoryArtwork category={child} kind="subcategory" className={navStyles.subcategoryArtwork} />
                                <span>{child.title}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {!(displayedCategory.children || []).length && <p className={navStyles.directoryMessage}>Discover everything in {displayedCategory.title} using Shop all.</p>}
                      </section>
                    )}
                    {!selectedSubcategory && !displayedCategory && !categoriesLoading && (
                      <div className={navStyles.directoryMessage}>
                        {categoriesError ? <><strong>Categories couldn’t load</strong><button type="button" onClick={() => void refetchCategories()}>Try again</button></> :
                          categorySearch ? <><strong>No matching categories</strong><p>Try a different name, such as kettle or kitchen.</p><button type="button" onClick={() => setCategorySearch("")}>Clear search</button></> :
                            <strong>No categories available</strong>}
                      </div>
                    )}

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
                          <CategoryArtwork category={selectedSubcategory} kind="subcategory" className={navStyles.resultsArtwork} />
                          <div className={navStyles.categoryTitle}>
                            {activeCategory && <p className={navStyles.categoryEyebrow}>{activeCategory.title}</p>}
                            <h3>{selectedSubcategory.title}</h3>
                            <p className={navStyles.resultCount} aria-live="polite">
                              {productsLoading ? "Loading products…" : productsError ? "Products unavailable" : `Showing ${filteredProducts.length} ${filteredProducts.length === 1 ? "product" : "products"}`}
                            </p>
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
                          <div className={filtersOpen ? "col-span-full" : navStyles.centeredProductLoader}>
                            <BrandLoader compact label="Finding your products…" />
                          </div>
                        ) : productsError ? (
                          <div className={navStyles.resultMessage}>
                            <strong>Products couldn’t load</strong>
                            <button type="button" onClick={() => {
                              setSettledSubcategory(null);
                              setProductsRetry(count => count + 1);
                            }}>Try again</button>
                          </div>
                        ) : filteredProducts.length === 0 ? (
                          <div className={navStyles.resultMessage}>
                            <SlidersHorizontal size={24} aria-hidden="true" />
                            <strong>No products found</strong>
                            <span>Try another brand or price range.</span>
                          </div>
                        ) : (
                          filteredProducts.map(product => (
                            <ProductCard key={product.id} {...product} prefetch={false}
                              sourceTag="category:mobile"
                              sourceCategoryId={selectedSubcategory.id}
                              sourceCategoryHandle={selectedSubcategory.handle}
                            />
                          ))
                        )}
                      </div>
                    ) : null}
                  </>
              </div>
            </div>
          </div>
        </div>}
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
          onSignOut={() => setSignOutOpen(true)}
        />
      </Overlay>
      <LogoutConfirmModal open={signOutOpen} onClose={() => setSignOutOpen(false)} onSignedOut={() => {
        setProfileOpen(false);
        router.refresh();
      }} />
    </>
  );
}
