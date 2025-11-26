"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Menu,
  ChevronDown,
  ChevronRight,
  X,
  Heart,
  Bell,
  User,
} from "lucide-react";
// import UserIcon from "@/components/ui/icons/UserIcon";
import OrderIcon from "@/components/ui/icons/OrderIcon";
import CartIcon from "@/components/ui/icons/CartIcon";
import LocationIcon from "@/components/ui/icons/LocationIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MedusaCategory } from "@/lib/medusa";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCartSummary } from "@/contexts/CartProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { toast } from "sonner";
import AccountDropdown from "@/components/modules/AccountDropdown";
import GuestAccountDropdown from "@/components/modules/GuestAccountDropdown";

type NavCategory = {
  id: string;
  title: string;
  handle?: string;
  children: NavCategory[];
};

type InternalCategory = {
  id: string;
  title: string;
  handle?: string;
  parentId: string | null;
  children: InternalCategory[];
};

const normalizeCategoryTitle = (cat: MedusaCategory) =>
  (cat.title || cat.name || "Category").toString();

const buildNavCategories = (categories: MedusaCategory[]) => {
  const nodes = new Map<string, InternalCategory>();

  categories.forEach((cat) => {
    if (!cat?.id) return;
    const parentId =
      (cat.parent_category_id as string | null | undefined) ??
      ((cat.parent_category as { id?: string | null } | undefined)?.id ?? null);
    nodes.set(cat.id, {
      id: cat.id,
      title: normalizeCategoryTitle(cat),
      handle: cat.handle || undefined,
      parentId: parentId || null,
      children: [],
    });
  });

  categories.forEach((cat) => {
    const children = (cat.category_children as MedusaCategory[] | undefined) || [];
    children.forEach((child) => {
      if (!child?.id) return;
      if (!nodes.has(child.id)) {
        nodes.set(child.id, {
          id: child.id,
          title: normalizeCategoryTitle(child),
          handle: child.handle || undefined,
          parentId: cat.id || null,
          children: [],
        });
      } else {
        const target = nodes.get(child.id)!;
        target.parentId = target.parentId || cat.id || null;
        target.title = target.title || normalizeCategoryTitle(child);
        target.handle = target.handle || child.handle || undefined;
      }
    });
  });

  nodes.forEach((node) => {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    }
  });

  const stripParent = (node: InternalCategory): NavCategory => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
    children: node.children
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(stripParent),
  });

  const roots = Array.from(nodes.values()).filter((node) => !node.parentId);
  roots.sort((a, b) => a.title.localeCompare(b.title));

  const withChildren = roots
    .filter((node) => node.children.length > 0)
    .map((node) => stripParent(node));
  const withoutChildren = roots
    .filter((node) => node.children.length === 0)
    .map((node) => stripParent(node));

  return { withChildren, withoutChildren };
};

const Header: React.FC = () => {
  const { count: cartCount } = useCartSummary();
  const { customer, logout } = useAuth();
  const [cartPreviewOpen, setCartPreviewOpen] = React.useState(false);
  const [cartPreviewLoading, setCartPreviewLoading] = React.useState(false);
  const [cartPreviewItems, setCartPreviewItems] = React.useState<
    Array<{ id: string; title: string; qty: number; price: number; image?: string }>
  >([]);
  const [cartPreviewError, setCartPreviewError] = React.useState<string | null>(null);
  const cartPreviewTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceFormatter = React.useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
      }),
    []
  );
  const [browseOpen, setBrowseOpen] = React.useState(false);
  const [expandedCol, setExpandedCol] = React.useState<string | null>(null);
  const [navCategories, setNavCategories] = React.useState<NavCategory[]>([]);
  const [overflowCategories, setOverflowCategories] = React.useState<NavCategory[]>([]);
  const [navCatsLoading, setNavCatsLoading] = React.useState(true);

  // dropdown states for portal:
  const [activeCategoryId, setActiveCategoryId] = React.useState<string | null>(null);
  const [allOpen, setAllOpen] = React.useState(false);

  const [selectedFilter, setSelectedFilter] = React.useState<
    | { type: "collection"; id?: string; handle?: string; title: string }
    | { type: "category"; id?: string; handle?: string; title: string }
    | { type: "all"; title: string }
    | null
  >({ type: "all", title: "All" });

  const [q, setQ] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<{ id: string; name: string; image?: string; handle?: string }[]>([]);
  const [showSuggest, setShowSuggest] = React.useState(false);
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [mobileExpandedCat, setMobileExpandedCat] = React.useState<string | null>(null);
  const [mobileProfileOpen, setMobileProfileOpen] = React.useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = React.useState(false);
  const moreMenuRef = React.useRef<HTMLDivElement | null>(null);
  const mountedRef = React.useRef(false);
  const mobileCategories = React.useMemo(() => [...navCategories, ...overflowCategories], [navCategories, overflowCategories]);
  const mobileProfileRef = React.useRef<HTMLDivElement | null>(null);
  const profileMenuRef = React.useRef<HTMLDivElement | null>(null);
  const profileMenuTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const wishlistCount = React.useMemo(() => {
    const list = (customer?.metadata as Record<string, unknown> | null | undefined)?.wishlist
    if (Array.isArray(list)) return list.length
    return 0
  }, [customer?.metadata])

  const handleLogout = React.useCallback(async () => {
    try {
      await logout();
      toast.success("You have been signed out.");
    } catch (err) {
      console.error("logout failed", err);
      toast.error("Could not sign out. Please try again.");
    } finally {
      setProfileMenuOpen(false);
      setMobileProfileOpen(false);
    }
  }, [logout]);

  const fetchCartPreview = React.useCallback(async () => {
    try {
      setCartPreviewLoading(true);
      setCartPreviewError(null);
      const res = await fetch("/api/medusa/cart", { cache: "no-store", credentials: "include" });
      if (!res.ok) {
        setCartPreviewError("Unable to load cart");
        setCartPreviewItems([]);
        return;
      }
      const data = await res.json();
      type CartLine = {
        id?: string | number;
        title?: string;
        quantity?: number;
        total?: number;
        subtotal?: number;
        unit_price?: number;
        variant_id?: string | number;
        product_id?: string | number;
        thumbnail?: string;
        variant?: { title?: string; thumbnail?: string };
        product?: { title?: string; name?: string; thumbnail?: string; images?: { url?: string }[] };
      };
      type CartPayload = { items?: CartLine[] };
      const cart = (data?.cart as CartPayload) ?? (data as CartPayload);
      const items = Array.isArray(cart?.items)
        ? cart.items.map((item) => ({
            id: String(item.id || item.variant_id || item.product_id || Math.random()),
            title: item.title || item.variant?.title || item.product?.title || item.product?.name || "Product",
            qty: Number(item.quantity) || 1,
            price:
              Number(item.total) ||
              Number(item.subtotal) ||
              Number(item.unit_price) * (Number(item.quantity) || 1) ||
              0,
            image:
              item.thumbnail ||
              item.variant?.thumbnail ||
              item.product?.thumbnail ||
              (Array.isArray(item.product?.images) ? item.product.images[0]?.url : undefined),
          }))
        : [];
      setCartPreviewItems(items);
    } catch (err) {
      console.warn("cart preview failed", err);
      setCartPreviewError("Unable to load cart");
      setCartPreviewItems([]);
    } finally {
      setCartPreviewLoading(false);
    }
  }, []);

  const customerName = React.useMemo(() => {
    if (!customer) return "";
    const first = typeof customer.first_name === "string" ? customer.first_name.trim() : "";
    const last = typeof customer.last_name === "string" ? customer.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    if (full) return full;
    if (customer.email) {
      const [local] = customer.email.split("@");
      return local || customer.email;
    }
    return "Account";
  }, [customer]);

  // mapping from category id to trigger element
  const triggersRef = React.useRef<Record<string, HTMLElement | null>>({});
  const allTriggerRef = React.useRef<HTMLElement | null>(null);
  const cartTriggerRef = React.useRef<HTMLElement | null>(null);

  // timers to control delayed hide (prevents disappearing while moving mouse)
  const hideTimerRef = React.useRef<number | null>(null);
  const allHideTimerRef = React.useRef<number | null>(null);

  // For re-positioning on resize/scroll
  const [, forceRerender] = React.useState(0);
  React.useEffect(() => {
    mountedRef.current = true;
    const onResize = () => forceRerender((n) => n + 1);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      mountedRef.current = false;
    };
  }, []);

  // Cleanup profile menu timer on unmount
  React.useEffect(() => {
    return () => {
      if (profileMenuTimerRef.current) {
        clearTimeout(profileMenuTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/medusa/collections")
      .then((r) => r.json())
      .then(() => {
        if (cancelled) return;
        // Collections loading removed - not used in dropdown anymore, using navCategories instead
      })
      .catch(() => {})
      .finally(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function loadNavCategories() {
      try {
        const res = await fetch("/api/medusa/categories", { cache: "no-store" });
        if (!res.ok) throw new Error("failed categories");
        const data = await res.json();
        const raw = Array.isArray(data.categories) ? (data.categories as MedusaCategory[]) : [];
        const { withChildren, withoutChildren } = buildNavCategories(raw);
        if (!cancelled) {
          setNavCategories(withChildren);
          setOverflowCategories(withoutChildren);
        }
      } catch {
        if (!cancelled) {
          setNavCategories([]);
          setOverflowCategories([]);
        }
      } finally {
        if (!cancelled) setNavCatsLoading(false);
      }
    }
    loadNavCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced suggestions
  React.useEffect(() => {
    const id = setTimeout(() => {
      if (q.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      const params = new URLSearchParams({ q });
      if (selectedFilter?.type === "category") {
        if (selectedFilter.handle) params.append("category", selectedFilter.handle);
      } else if (selectedFilter?.type === "collection") {
        if (selectedFilter.id) params.append("collectionId", selectedFilter.id);
        else if (selectedFilter.handle) params.append("collection", selectedFilter.handle);
      } else if (selectedFilter?.type === "all") {
        // nothing
      }
      fetch(`/api/medusa/search?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          type S = { id: string; name: string; image?: string; handle?: string };
          const list: S[] = (d.products as S[] || []).map((p) => ({
            id: p.id,
            name: p.name,
            image: (p as S).image,
            handle: (p as S).handle,
          }));
          setSuggestions(list);
        })
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q, selectedFilter]);

  // compute dropdown position & size (smaller than before)
  // use position: fixed so portal remains stable during page scroll
  const computeDropdownStyle = (
    triggerEl: HTMLElement | null,
    preferMaxWidth = 360
  ): React.CSSProperties => {
    if (!triggerEl) {
      return { left: 0, top: 0, visibility: "hidden" as const } as React.CSSProperties;
    }
    const rect = triggerEl.getBoundingClientRect();
    const gutter = 8;
    const preferredTop = rect.bottom + gutter;
    const maxWidth = preferMaxWidth;
    const minWidth = 220;
    const viewportRight = window.innerWidth - 16;
    const availableRight = Math.max(200, viewportRight - rect.left);
    const width = Math.min(maxWidth, Math.max(minWidth, Math.min(availableRight, 420)));
    let left = rect.left;
    if (left + width + 16 > window.innerWidth) {
      left = Math.max(8, window.innerWidth - width - 16);
    }
    return {
      position: "fixed" as const,
      left,
      top: preferredTop,
      width,
      zIndex: 9999,
      visibility: "visible" as const,
    };
  };

  // helpers: start/clear hide timers for category dropdown
  const clearHideTimer = React.useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);
  // increased default delay slightly so user moving mouse has buffer
  const startHideTimer = React.useCallback(
    (delay = 350) => {
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => setActiveCategoryId(null), delay);
    },
    [clearHideTimer]
  );

  // same for All dropdown (kept a longer delay for All)
  const clearAllHideTimer = React.useCallback(() => {
    if (allHideTimerRef.current) {
      window.clearTimeout(allHideTimerRef.current);
      allHideTimerRef.current = null;
    }
  }, []);
  const startAllHideTimer = React.useCallback(
    (delay = 600) => {
      clearAllHideTimer();
      allHideTimerRef.current = window.setTimeout(() => setAllOpen(false), delay);
    },
    [clearAllHideTimer]
  );

  // Handle click outside to close dropdowns
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const browseRoot = document.querySelector("[data-browse-root]");
      if (browseRoot && !browseRoot.contains(target)) {
        setBrowseOpen(false);
      }
      if (!target.closest(".relative.flex")) {
        setShowSuggest(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setAllOpen(false);
      }
      if (mobileProfileRef.current && !mobileProfileRef.current.contains(target)) {
        setMobileProfileOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
      if (!target.closest("[data-nav-category]")) {
        // start a short delay before closing active category to allow mouse to enter portal
        startHideTimer();
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [startHideTimer]);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  // Dropdown portal for active category
  const CategoryPortal: React.FC = () => {
    if (!activeCategoryId) return null;
    const active = navCategories.find((c) => c.id === activeCategoryId);
    if (!active || !mountedRef.current) return null;
    const trigger = triggersRef.current[activeCategoryId] ?? null;
    const style = computeDropdownStyle(trigger, 360);

    return createPortal(
      <div
        // allow pointer to reach other nav items by disabling capture on wrapper
        style={{ position: "fixed", left: 0, top: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 1300 }}
        aria-hidden={!active}
      >
        <div
          // actual visible panel handles hover/focus
          onMouseEnter={() => clearHideTimer()}
          onMouseLeave={() => startHideTimer()}
          style={{
            ...style,
            pointerEvents: "auto",
            maxHeight: "420px",
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
          className="rounded-xl bg-white shadow-2xl ring-1 ring-black/5 p-3 border border-gray-100 transition-transform duration-160"
          role="menu"
        >
          {/* scrollable area */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-3">
            {active.children.map((sub) => (
              <Link
                key={sub.id}
                href={getCategoryHref(sub.handle)}
                className="rounded-md px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 transition block"
                onClick={() => setActiveCategoryId(null)}
              >
                {sub.title}
              </Link>
            ))}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // Portal for "All" dropdown (overflow categories)
  const AllPortal: React.FC = () => {
    if (!allOpen || !mountedRef.current) return null;
    const trigger = allTriggerRef.current ?? null;
    const style = computeDropdownStyle(trigger, 320);

    return createPortal(
      <div
        style={{ position: "fixed", left: 0, top: 0, right: 0, bottom: 0, pointerEvents: "auto", zIndex: 1250 }}
        onMouseEnter={() => clearAllHideTimer()}
        onMouseLeave={() => startAllHideTimer()}
      >
        <div
          onMouseEnter={() => clearAllHideTimer()}
          onMouseLeave={() => startAllHideTimer()}
          style={{
            ...style,
            maxHeight: "420px",
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
          className="rounded-xl bg-white shadow-2xl ring-1 ring-black/5 p-3 border border-gray-100 transition-transform duration-160"
          role="menu"
        >
          <div style={{ padding: 8 }} className="pb-3">
            <div className="px-2 py-1 text-xs text-gray-500 font-semibold">More Categories</div>
          </div>
          <div className="divide-y divide-gray-100">
            {navCatsLoading && overflowCategories.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">Loading categories…</div>
            ) : overflowCategories.length ? (
              overflowCategories.map((cat) => (
                <Link
                  key={cat.id}
                  href={getCategoryHref(cat.handle)}
                  className="flex items-center justify-between px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 transition"
                  onClick={() => setAllOpen(false)}
                >
                  <span>{cat.title}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500">No additional categories</div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // Portal for Cart Preview
  const CartPreviewPortal: React.FC = () => {
    if (!cartPreviewOpen || !mountedRef.current) return null;
    const trigger = cartTriggerRef.current ?? null;
    if (!trigger) return null;
    
    const rect = trigger.getBoundingClientRect();
    const gutter = 8;
    const preferredTop = rect.bottom + gutter;
    const width = 320;
    const right = window.innerWidth - rect.right;
    
    // Create a bridge area to prevent gap between trigger and preview
    const bridgeWidth = Math.min(rect.width, 100);
    const bridgeStyle: React.CSSProperties = {
      position: "fixed",
      right: window.innerWidth - rect.right,
      top: rect.bottom,
      width: bridgeWidth,
      height: gutter + 4,
      pointerEvents: "auto",
      zIndex: 9998,
    };
    
    const style: React.CSSProperties = {
      position: "fixed",
      right: right,
      top: preferredTop,
      width,
      zIndex: 9999,
      visibility: "visible",
    };

    return createPortal(
      <>
        {/* Bridge area to prevent gap */}
        <div
          style={bridgeStyle}
          onMouseEnter={() => {
            if (cartPreviewTimer.current) clearTimeout(cartPreviewTimer.current);
          }}
        />
        <div
          style={{
            ...style,
            pointerEvents: "auto",
            backgroundColor: "#ffffff",
            opacity: 1,
            isolation: "isolate",
          }}
          className="bg-white rounded-2xl border border-gray-200 shadow-2xl ring-1 ring-black/5 p-3"
          onMouseEnter={() => {
            if (cartPreviewTimer.current) clearTimeout(cartPreviewTimer.current);
          }}
          onMouseLeave={() => {
            cartPreviewTimer.current = setTimeout(() => setCartPreviewOpen(false), 300);
          }}
        >
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-header-text">
            <CartIcon className="w-4 h-4" />
            <span>Cart preview</span>
          </div>
          {cartPreviewLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : cartPreviewError ? (
            <p className="text-sm text-rose-500">{cartPreviewError}</p>
          ) : cartPreviewItems.length === 0 ? (
            <p className="text-sm text-slate-600">Your cart is empty.</p>
          ) : (
            <div className="space-y-3">
              {cartPreviewItems.slice(0, 4).map((item) => (
                <div key={item.id} className="flex gap-3 items-center">
                  <div className="h-12 w-12 rounded-lg bg-gray-50 overflow-hidden flex-shrink-0">
                    {item.image ? (
                      <Image src={item.image} alt={item.title} width={48} height={48} className="h-full w-full object-contain" />
                    ) : (
                      <div className="h-full w-full bg-gray-100" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                    <p className="text-xs text-slate-500">Qty {item.qty}</p>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{priceFormatter.format(item.price)}</div>
                </div>
              ))}
              {cartPreviewItems.length > 4 && (
                <p className="text-xs text-slate-500">+{cartPreviewItems.length - 4} more item(s)</p>
              )}
            </div>
          )}
          <div className="mt-3">
            <Link
              href="/cart"
              className="block text-center rounded-full bg-header-accent text-white text-sm font-semibold px-3 py-2 hover:bg-header-accent/90 transition"
              onClick={() => setCartPreviewOpen(false)}
            >
              View cart
            </Link>
          </div>
        </div>
      </>,
      document.body
    );
  };

  return (
    <header className="w-full header-root md:sticky md:top-0 md:z-[120] bg-header-bg shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      {/* Top Bar */}
      <div className="bg-header-top-bg text-header-top-text py-2.5 text-center text-sm">
        <p>
          Get 10% Extra off! - Use Code <span className="font-semibold">OWEG10</span>{" "}
          <a href="#" className="underline hover:text-header-accent transition-colors">
            ShopNow
          </a>
        </p>
      </div>

      {/* Main Header */}
      <div className="bg-header-bg">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="hidden md:flex items-center gap-6 lg:gap-8 w-full">
            {/* Logo */}
            <div className="flex items-center flex-shrink-0">
              <Link href="/" className="flex items-center logo-link">
                <Image src="/oweg_logo.png" alt="OWEG" width={100} height={32} className="h-10 w-auto" />
              </Link>
            </div>

            {/* Delivery Location */}
            <button
              type="button"
              className="hidden lg:flex items-center gap-2.5 text-sm location-block hover:opacity-80 transition-opacity px-2"
              onClick={() => {
                // TODO: Open location modal
                toast.info("Location selector coming soon");
              }}
            >
              <LocationIcon className="w-5 h-5 text-header-text flex-shrink-0" />
              <div className="text-left">
                <p className="text-header-text text-xs leading-tight">Deliver to</p>
                <p className="text-header-text font-medium text-sm leading-tight">Bangalore 560034</p>
              </div>
            </button>

            {/* Search Bar */}
            <div className="flex-1 max-w-3xl mx-4">
              <div className="flex gap-0 relative items-stretch">
                {/* Category Dropdown ("All") - Pixel Perfect */}
                <div className="relative" data-browse-root>
                  <button
                    onClick={() => setBrowseOpen((v) => !v)}
                    className="h-10 px-4 bg-white border border-gray-300 border-r-0 rounded-l-md text-sm font-normal text-gray-700 flex items-center justify-between gap-2 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-header-accent focus:ring-offset-0 focus:z-10"
                    type="button"
                    style={{
                      minWidth: '120px',
                    }}
                  >
                    <span className="truncate">{selectedFilter ? selectedFilter.title : "All"}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-600 shrink-0 transition-transform duration-200 ${browseOpen ? "rotate-180" : ""}`} />
                  </button>
                  {browseOpen && (
                    <div className="absolute left-0 mt-1 z-[9999] bg-white rounded-md shadow-lg ring-1 ring-black/5 w-[320px] max-h-[70vh] overflow-auto p-1 scrollbar-hide">
                      <div className="mb-1 border-b border-gray-100 pb-1">
                        <button
                          onClick={() => {
                            setSelectedFilter({ type: "all", title: "All" });
                            setBrowseOpen(false);
                            setExpandedCol(null);
                          }}
                          className="w-full text-left px-2 py-2 text-sm hover:bg-gray-100 rounded"
                          type="button"
                        >
                          All
                        </button>
                      </div>
                      {navCatsLoading ? (
                        <div className="px-2 py-2 text-sm text-gray-500">Loading categories...</div>
                      ) : (
                        <>
                          {/* Show categories with children */}
                          {navCategories.map((cat) => (
                            <div key={cat.id} className="">
                              <button
                                onClick={() => {
                                  const isOpen = expandedCol === cat.id;
                                  setExpandedCol(isOpen ? null : cat.id);
                                }}
                                className="w-full flex items-center justify-between px-2 py-2 text-sm hover:bg-gray-100 rounded"
                                type="button"
                              >
                                <span className="truncate text-left">{cat.title}</span>
                                <ChevronRight className={`w-4 h-4 transition-transform ${expandedCol === cat.id ? "rotate-90" : ""}`} />
                              </button>
                              {expandedCol === cat.id && cat.children.length > 0 && (
                                <div className="pl-3 pb-2">
                                  {cat.children.map((child) => (
                                    <button
                                      key={child.id}
                                      onClick={() => {
                                        setSelectedFilter({ type: "category", title: child.title, handle: child.handle });
                                        setBrowseOpen(false);
                                        setExpandedCol(null);
                                      }}
                                      className="w-full text-left block px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-100 rounded"
                                      type="button"
                                    >
                                      {child.title}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                          {/* Show categories without children */}
                          {overflowCategories.map((cat) => (
                            <button
                              key={cat.id}
                              onClick={() => {
                                setSelectedFilter({ type: "category", title: cat.title, handle: cat.handle });
                                setBrowseOpen(false);
                                setExpandedCol(null);
                              }}
                              className="w-full text-left px-2 py-2 text-sm hover:bg-gray-100 rounded"
                              type="button"
                            >
                              {cat.title}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Search Input - Pixel Perfect */}
                <div className="flex-1 flex relative">
                  <Input
                    type="text"
                    placeholder={selectedFilter ? `Search in ${selectedFilter.title}...` : "Search in All..."}
                    className="h-10 rounded-none border-y border-gray-300 border-x-0 px-4 text-sm focus:ring-2 focus:ring-header-accent focus:border-y-header-accent focus:z-10"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setShowSuggest(true);
                    }}
                    onFocus={() => setShowSuggest(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && q.trim()) {
                        const params = new URLSearchParams({ q: q.trim() });
                        if (selectedFilter?.type === "category" && selectedFilter.handle) {
                          params.append("category", selectedFilter.handle);
                        } else if (selectedFilter?.type === "collection") {
                          if (selectedFilter.id) params.append("collectionId", selectedFilter.id);
                          else if (selectedFilter.handle) params.append("collection", selectedFilter.handle);
                        }
                        router.push(`/search?${params.toString()}`);
                        setShowSuggest(false);
                      }
                    }}
                  />
                  {showSuggest && q.length >= 2 && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 z-50 w-full bg-white rounded-md shadow-lg ring-1 ring-black/5 max-h-[60vh] overflow-auto">
                      {suggestions.map((s) => {
                        const slug = encodeURIComponent(String(s.handle || s.id))
                        const href = `/productDetail/${slug}?id=${encodeURIComponent(String(s.id))}`
                        return (
                          <Link
                            key={s.id}
                            href={href}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                            onClick={() => setShowSuggest(false)}
                          >
                            {s.image ? (
                              <Image src={s.image} alt={s.name} width={36} height={36} className="rounded object-cover" />
                            ) : (
                              <div className="w-9 h-9 bg-gray-200 rounded" />
                            )}
                            <div className="text-sm text-gray-800 truncate">{s.name}</div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Search Button - Square Green Button with Black Icon - Pixel Perfect */}
                <Button
                  className="h-10 w-10 rounded-r-md bg-header-accent hover:bg-[#6bb832] active:bg-[#5aa028] text-black p-0 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-header-accent focus:ring-offset-0 focus:z-10 border border-l-0 border-gray-300"
                  type="button"
                  onClick={() => {
                    if (q.trim()) {
                      const params = new URLSearchParams({ q: q.trim() });
                      if (selectedFilter?.type === "category" && selectedFilter.handle) {
                        params.append("category", selectedFilter.handle);
                      } else if (selectedFilter?.type === "collection") {
                        if (selectedFilter.id) params.append("collectionId", selectedFilter.id);
                        else if (selectedFilter.handle) params.append("collection", selectedFilter.handle);
                      }
                      router.push(`/search?${params.toString()}`);
                      setShowSuggest(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && q.trim()) {
                      const params = new URLSearchParams({ q: q.trim() });
                      if (selectedFilter?.type === "category" && selectedFilter.handle) {
                        params.append("category", selectedFilter.handle);
                      } else if (selectedFilter?.type === "collection") {
                        if (selectedFilter.id) params.append("collectionId", selectedFilter.id);
                        else if (selectedFilter.handle) params.append("collection", selectedFilter.handle);
                      }
                      router.push(`/search?${params.toString()}`);
                      setShowSuggest(false);
                    }
                  }}
                >
                  <Search className="w-5 h-5 text-black" strokeWidth={2.5} />
                </Button>
              </div>
            </div>

            {/* Right Section - Account, Orders, Cart */}
            <div className="hidden md:flex items-center gap-4 lg:gap-5 ml-auto flex-shrink-0">
              {/* Account Section - Always visible (like Amazon) */}
              <div
                className="relative group"
                ref={profileMenuRef}
                onMouseEnter={() => {
                  clearTimeout(profileMenuTimerRef.current || undefined);
                  setProfileMenuOpen(true);
                }}
                onMouseLeave={() => {
                  profileMenuTimerRef.current = setTimeout(() => setProfileMenuOpen(false), 300) as ReturnType<typeof setTimeout>;
                }}
              >
                <button
                  type="button"
                  className="flex items-start gap-2 px-2 py-1 text-left hover:opacity-80 transition-opacity"
                  aria-label="Account menu"
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="true"
                >
                  <User className="w-5 h-5 text-header-text mt-0.5 shrink-0" />
                  <div className="text-left">
                    <p className="text-xs text-header-text leading-tight">Hello,</p>
                    <p className="text-sm font-medium text-header-text leading-tight whitespace-nowrap">
                      {customer ? customerName : "User"}
                    </p>
                    <p className="text-xs text-header-text leading-tight">Account & Lists</p>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-header-text transition-transform mt-1 flex-shrink-0 ${
                      profileMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {profileMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 z-[9999]"
                    style={{ backgroundColor: 'transparent' }}
                    onMouseEnter={() => {
                      clearTimeout(profileMenuTimerRef.current || undefined);
                      setProfileMenuOpen(true);
                    }}
                    onMouseLeave={() => {
                      profileMenuTimerRef.current = setTimeout(() => setProfileMenuOpen(false), 300) as ReturnType<typeof setTimeout>;
                    }}
                  >
                    {customer ? (
                      <AccountDropdown
                        onLogout={handleLogout}
                      />
                    ) : (
                      <GuestAccountDropdown />
                    )}
                  </div>
                )}
              </div>

              {/* Orders */}
              <Link href="/orders" className="hidden lg:flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                <OrderIcon className="w-5 h-5 text-header-text shrink-0" />
                <span className="text-sm font-medium text-header-text">Orders</span>
              </Link>

              {/* Cart */}
              <div
                ref={(el) => { cartTriggerRef.current = el; }}
                className="relative flex items-start gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                onMouseEnter={() => {
                  if (cartPreviewTimer.current) {
                    clearTimeout(cartPreviewTimer.current);
                    cartPreviewTimer.current = null;
                  }
                  setCartPreviewOpen(true);
                  void fetchCartPreview();
                }}
                onMouseLeave={() => {
                  if (cartPreviewTimer.current) clearTimeout(cartPreviewTimer.current);
                  cartPreviewTimer.current = setTimeout(() => setCartPreviewOpen(false), 300);
                }}
              >
                <Link href="/cart" className="flex items-start gap-2">
                  <div className="relative mt-0.5">
                    <CartIcon className="w-6 h-6 text-header-text flex-shrink-0" />
                    {cartCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-header-accent text-white text-[10px] font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                        {cartCount > 99 ? "99+" : cartCount}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-header-text leading-tight">
                    Cart
                  </span>
                </Link>
              </div>
            </div>
          </div>

            <div className="flex flex-col gap-0 md:hidden">
              <div className="fixed top-0 left-0 right-0 z-[1400] bg-white/95 backdrop-blur border-b border-gray-100">
              <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
                <div className="flex items-center gap-4 flex-1">
                <button
                  type="button"
                  aria-label="Open menu"
                  className="w-11 h-11 rounded-full border border-gray-200 text-[#7AC943] flex items-center justify-center shadow-sm"
                  onClick={() => setMobileMenuOpen(true)}
                >
                  <Menu className="w-5 h-5" />
                </button>
                <Link href="/" className="flex items-center" aria-label="OWEG home">
                  <Image src="/oweg_logo.png" alt="OWEG" width={100} height={28} className="h-7 w-auto" priority />
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/notifications"
                  className="relative w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center shadow-sm text-[#7AC943]"
                  aria-label="Notifications"
                >
                  <Bell className="w-5 h-5" />
                </Link>
                <Link href="/cart" className="relative w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center shadow-sm text-[#7AC943]" aria-label="Cart">
                  <CartIcon className="w-5 h-5" />
                  <span className="absolute -top-1.5 -right-1.5 bg-header-accent text-white text-[11px] font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                </Link>
              </div>
              </div>

              <div className="px-4 mt-1 relative mobile-search-bar">
                <Input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setShowSuggest(true);
                  }}
                  onFocus={() => setShowSuggest(true)}
                  placeholder="Search products, categories..."
                  className="h-12 rounded-full border-gray-200 bg-white shadow-sm pr-14"
                />
                <div className="absolute inset-y-1 right-5 flex items-center">
                  <div className="w-10 h-10 rounded-full bg-header-accent text-white flex items-center justify-center shadow">
                    <Search className="w-5 h-5" />
                  </div>
                </div>
                {showSuggest && q.length >= 2 && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl ring-1 ring-black/5 z-50 max-h-[60vh] overflow-y-auto">
                    {suggestions.map((s) => {
                      const slug = encodeURIComponent(String(s.handle || s.id));
                      const href = `/productDetail/${slug}?id=${encodeURIComponent(String(s.id))}`;
                      return (
                        <Link
                          key={s.id}
                          href={href}
                          className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
                          onClick={() => setShowSuggest(false)}
                        >
                          {s.image ? (
                            <Image src={s.image} alt={s.name} width={40} height={40} className="rounded-md object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-md bg-gray-200" />
                          )}
                          <span className="text-sm text-header-text truncate">{s.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="md:hidden mobile-header-spacer" style={{ height: '82px' }} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Navigation Bar */}
      <nav className="bg-header-nav-bg hidden md:block">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          {/* make this container overflow-x but allow dropdowns via portal (portal prevents clipping) */}
          <div
            className="flex items-center gap-4 md:gap-6 overflow-x-auto overflow-y-visible py-1 relative"
            data-nav-scroll
          >
            {/* All + overflow */}
            <div
              ref={moreMenuRef}
              className="relative flex-shrink-0"
              onMouseEnter={() => { clearAllHideTimer(); setAllOpen(true); }}
              onMouseLeave={() => startAllHideTimer()}
            >
              <button
                ref={(el) => {
                  allTriggerRef.current = el;
                }}
                className="flex items-center gap-2 py-3 px-2 text-header-text hover:text-header-accent transition-colors whitespace-nowrap"
                onClick={() => { setAllOpen((v) => !v); }}
                aria-haspopup="menu"
                aria-expanded={allOpen}
                type="button"
              >
                <Menu className="w-5 h-5" />
                <span className="font-medium">All</span>
              </button>
            </div>

            {/* Primary categories with dropdown triggers */}
            {navCatsLoading ? (
              <div className="py-3 text-sm text-gray-500">Loading categories…</div>
            ) : navCategories.length > 0 ? (
              navCategories.map((cat) => {
                const categoryHref = getCategoryHref(cat.handle);
                return (
                  <div
                    key={cat.id}
                    data-nav-category
                    className="relative flex-shrink-0 group"
                    onMouseEnter={() => { clearHideTimer(); setActiveCategoryId(cat.id); }}
                    onMouseLeave={() => startHideTimer()}
                  >
                    <Link
                      href={categoryHref}
                      ref={(el: HTMLAnchorElement | null) => { triggersRef.current[cat.id] = el; }}
                      className="nav-link relative py-3 px-2 pr-6 md:pr-2 text-sm text-header-text font-medium whitespace-nowrap transition-colors hover:text-header-accent flex items-center gap-1.5"
                      onClick={() => {
                        setSelectedFilter({ type: "category", title: cat.title, handle: cat.handle });
                      }}
                    >
                      <span className="truncate">{cat.title}</span>
                      <ChevronDown className="hidden md:inline-block w-3.5 h-3.5 text-header-muted transition group-hover:text-header-accent" />
                    </Link>

                    {/* mobile toggle */}
                    <button
                      className="md:hidden absolute right-0 top-1/2 -translate-y-1/2 p-1 text-header-text"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveCategoryId((prev) => (prev === cat.id ? null : cat.id));
                      }}
                      aria-label={`Toggle ${cat.title} menu`}
                      type="button"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${activeCategoryId === cat.id ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="py-3 text-sm text-gray-500">No categories found.</div>
            )}
          </div>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[140] md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[85%] max-w-sm bg-white shadow-2xl p-5 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-gray-400">Browse</p>
                <p className="text-lg font-semibold text-header-text">All categories</p>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-header-text"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <Link href="/login" className="block px-3 py-2 rounded-lg border border-gray-200 text-sm text-header-text" onClick={() => setMobileMenuOpen(false)}>
                Login / Signup
              </Link>
              <button type="button" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-header-text text-left">
                Help Center
              </button>
            </div>
            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-3">Categories</p>
              <div className="divide-y divide-gray-100">
                {navCatsLoading ? (
                  <div className="py-3 text-sm text-gray-500">Loading categories...</div>
                ) : mobileCategories.length ? (
                  mobileCategories.map((cat) => {
                    const hasChildren = cat.children && cat.children.length > 0;
                    const isOpen = mobileExpandedCat === cat.id;
                    if (!hasChildren) {
                      return (
                        <Link
                          key={cat.id}
                          href={getCategoryHref(cat.handle)}
                          className="flex items-center justify-between py-3 text-sm text-header-text"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <span>{cat.title}</span>
                          <ChevronRight className="w-4 h-4 text-header-muted" />
                        </Link>
                      );
                    }
                    return (
                      <div key={cat.id} className="py-1">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between py-3 text-sm font-semibold text-header-text"
                          onClick={() => setMobileExpandedCat(isOpen ? null : cat.id)}
                        >
                          <span>{cat.title}</span>
                          <ChevronDown className={`w-4 h-4 text-header-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </button>
                        <div className={`grid transition-all overflow-hidden ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                          <div className="overflow-hidden flex flex-col gap-1 pb-3">
                            {cat.children.map((child) => (
                              <Link
                                key={child.id}
                                href={getCategoryHref(child.handle)}
                                className="text-sm text-header-muted px-2 py-1 text-left"
                                onClick={() => setMobileMenuOpen(false)}
                              >
                                {child.title}
                              </Link>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-3 text-sm text-gray-500">No categories available</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Render dropdown portals (so they're never clipped by nav overflow) */}
      <CategoryPortal />
      <AllPortal />
      <CartPreviewPortal />

      {/* Internal styles (no external file) */}
      <style jsx global>{`
        @font-face {
          font-family: "OPTIHandelGothic-Light";
          src: url("/fonts/OPTIHandelGothic-Light.woff2") format("woff2");
          font-weight: 300;
          font-style: normal;
          font-display: swap;
        }
        :root {
          --header-accent: #7AC943;
          --header-top-bg: #000000;
          --header-top-text: #ffffff;
          --header-bg: #ffffff;
          --header-nav-bg: #efefef;
          --header-text: #111827;
          --header-muted: #6b7280;
        }
        .header-root {
          font-family: "OPTIHandelGothic-Light", ui-sans-serif, system-ui, -apple-system, "Segoe UI",
            Roboto, "Helvetica Neue", Arial;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        .header-root button,
        .header-root .cursor-pointer {
          cursor: pointer !important;
        }
        .bg-header-top-bg {
          background: var(--header-top-bg);
        }
        .text-header-top-text {
          color: var(--header-top-text);
        }
        .bg-header-bg {
          background: var(--header-bg);
        }
        .bg-header-nav-bg {
          background: var(--header-nav-bg);
        }
        .text-header-text {
          color: var(--header-text);
        }
        .text-header-muted {
          color: var(--header-muted);
        }
        .text-header-accent {
          color: var(--header-accent);
        }
        .bg-header-accent {
          background: var(--header-accent);
        }
        .logo-link:hover {
          transform: translateY(-2px);
          transition: transform 220ms ease;
        }
        [data-nav-scroll] {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        [data-nav-scroll]::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        /* Ensure cart preview is fully opaque */
        [data-cart-preview] {
          background-color: #ffffff !important;
          opacity: 1 !important;
          isolation: isolate;
        }
        /* Force white background on cart preview portal */
        body > div[style*="z-index: 9999"] {
          background-color: #ffffff !important;
          opacity: 1 !important;
        }
        .location-block .text-header-text {
          color: var(--header-text);
        }
        .location-block .text-header-text:first-child {
          color: var(--header-muted);
        }
        .nav-link {
          position: relative;
          color: var(--header-text);
        }
        .nav-link::after {
          content: "";
          position: absolute;
          left: 0;
          bottom: 6px;
          height: 2px;
          width: 0%;
          background: var(--header-accent);
          transform-origin: left center;
          transition: width 260ms cubic-bezier(.2,.9,.2,1), opacity 200ms ease;
          opacity: 0;
        }
        .nav-link:hover {
          color: var(--header-accent);
        }
        .nav-link:hover::after {
          width: 100%;
          opacity: 1;
        }
        .bg-header-top-bg a:hover {
          color: var(--header-accent) !important;
        }
        .group-hover\\:text-header-accent:hover,
        .group:hover .group-hover\\:text-header-accent {
          color: var(--header-accent);
        }
        input::placeholder {
          color: rgba(0, 0, 0, 0.45);
        }
        @media (max-width: 768px) {
          .nav-link::after {
            bottom: 4px;
          }
          body.category-overlay-open .mobile-search-bar {
            display: none;
          }
          body.category-overlay-open .mobile-header-spacer {
            height: 20px !important;
          }
        }
      `}</style>
    </header>
  );
};

export default Header;
  const getCategoryHref = (handle?: string) =>
    handle ? `/c/${encodeURIComponent(handle)}` : "#";
