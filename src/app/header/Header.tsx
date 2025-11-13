"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  MapPin,
  Search,
  ShoppingCart,
  User,
  Menu,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MedusaCategory } from "@/lib/medusa";
import Link from "next/link";
import Image from "next/image";

const MENU_COLLECTIONS = [
  { title: "Home Appliances", handle: "home-appliances" },
  { title: "Kitchen Appliances", handle: "kitchen-appliances" },
  { title: "Computer & Mobile Accessories", handle: "computer-&-mobile-accessories" },
  { title: "Surveillance & Security", handle: "surveillance-&-security" },
  { title: "Clothing", handle: "clothing" },
  { title: "Bags", handle: "bags" },
  { title: "Hardware", handle: "hardware" },
  { title: "Toys & Games", handle: "toys-&-games" },
  { title: "Health Care", handle: "health-care" },
  { title: "Stationery", handle: "stationery" },
  { title: "Beauty & Personal Care", handle: "beauty-&-personal-care" },
  { title: "Jewellery", handle: "jewellery" },
  { title: "Umbrellas", handle: "umbrellas" },
];

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
  const [collections, setCollections] = React.useState<
    { id?: string; title: string; handle?: string; created_at?: string }[]
  >([]);
  const [catsByCollection, setCatsByCollection] = React.useState<Record<string, { title: string; handle?: string }[]>>({});
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
  const moreMenuRef = React.useRef<HTMLDivElement | null>(null);
  const mountedRef = React.useRef(false);

  // mapping from category id to trigger element
  const triggersRef = React.useRef<Record<string, HTMLElement | null>>({});
  const allTriggerRef = React.useRef<HTMLElement | null>(null);

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
      if (!target.closest("[data-nav-category]")) {
        // start a short delay before closing active category to allow mouse to enter portal
        startHideTimer();
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/medusa/collections")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        type Col = { id?: string; title?: string; name?: string; handle?: string; created_at?: string };
        type OutCol = { id?: string; title: string; handle?: string; created_at?: string };
        const cols = ((d.collections as Col[]) || [])
          .map<OutCol>((c) => ({ id: c.id, title: (c.title || c.name || "").toString(), handle: c.handle, created_at: c.created_at }))
          .filter((c) => !!c.title)
          .sort((a, b) => {
            const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
            if (ad && bd) return ad - bd; // oldest first
            if (ad && !bd) return -1;
            if (!ad && bd) return 1;
            return String(a.title).localeCompare(String(b.title));
          });
        const allowed = MENU_COLLECTIONS.map((menu) => {
          const match = cols.find((c) => {
            const menuHandle = (menu.handle || menu.title).toLowerCase();
            const handleMatch = c.handle ? c.handle.toLowerCase() === menuHandle : false;
            const titleMatch = c.title.toLowerCase() === menu.title.toLowerCase();
            return handleMatch || titleMatch;
          });
          return match ? match : { title: menu.title, handle: menu.handle };
        });
        setCollections(allowed);
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

  function ensureCatsForCollection(col: { id?: string; handle?: string }) {
    const key = col.id || col.handle;
    if (!key || catsByCollection[key]) return;
    fetch(`/api/medusa/collections/${encodeURIComponent(key)}/categories`)
      .then((r) => r.json())
      .then((d) => {
        type Cat = { title?: string; name?: string; handle?: string };
        const arr = (d.categories as Cat[] || [])
          .map((c) => ({ title: (c.title || c.name || "").toString(), handle: c.handle }))
          .filter((c) => !!c.title);
        setCatsByCollection((prev) => ({ ...prev, [key]: arr }));
      })
      .catch(() => {});
  }

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
  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };
  // increased default delay slightly so user moving mouse has buffer
  const startHideTimer = (delay = 350) => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => setActiveCategoryId(null), delay);
  };

  // same for All dropdown (kept a longer delay for All)
  const clearAllHideTimer = () => {
    if (allHideTimerRef.current) {
      window.clearTimeout(allHideTimerRef.current);
      allHideTimerRef.current = null;
    }
  };
  const startAllHideTimer = (delay = 600) => {
    clearAllHideTimer();
    allHideTimerRef.current = window.setTimeout(() => setAllOpen(false), delay);
  };

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
        style={{ position: "fixed", left: 0, top: 0, right: 0, bottom: 0, pointerEvents: "none" }}
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
                href={sub.handle ? `/c/${sub.handle}` : "#"}
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
        style={{ position: "fixed", left: 0, top: 0, right: 0, bottom: 0, pointerEvents: "auto" }}
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
                  href={cat.handle ? `/c/${cat.handle}` : "#"}
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

  return (
    <header className="w-full header-root sticky top-0 z-50 bg-header-bg shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      {/* Top Bar */}
      <div className="bg-header-top-bg text-header-top-text py-2 text-center text-sm">
        <p>
          Get 10% Extra off! - Use Code <span className="font-semibold">OWEG10</span>{" "}
          <a href="#" className="underline hover:text-header-accent transition-colors">
            ShopNow
          </a>
        </p>
      </div>

      {/* Main Header */}
      <div className="bg-header-bg border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="text-3xl font-bold">
                <Link href="/" className="flex items-center logo-link">
                  <Image src="/oweg_logo.png" alt="OWEG" width={100} height={32} className="h-8 w-auto" />
                </Link>
              </div>
            </div>

            {/* Delivery Location */}
            <div className="hidden lg:flex items-center gap-2 text-sm location-block">
              <MapPin className="w-5 h-5 text-header-text" />
              <div>
                <p className="text-header-text text-xs">Deliver to John</p>
                <p className="text-header-text font-medium">Bangalore 560034</p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex-1 max-w-2xl">
              <div className="flex gap-2 relative">
                {/* Browse dropdown with Collections -> Categories */}
                <div className="relative" data-browse-root>
                  <button
                    onClick={() => setBrowseOpen((v) => !v)}
                    className="w-48 bg-header-bg border border-header-text/20 rounded-md px-3 h-10 text-sm flex items-center justify-between"
                    type="button"
                  >
                    <span className="truncate">{selectedFilter ? selectedFilter.title : "Browse"}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${browseOpen ? "rotate-180" : ""}`} />
                  </button>
                  {browseOpen && (
                    <div className="absolute left-0 mt-2 z-50 bg-white rounded-md shadow-lg ring-1 ring-black/5 w-[320px] max-h-[70vh] overflow-auto p-1">
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
                      {(collections.length ? collections : MENU_COLLECTIONS.map((m) => ({ id: undefined as undefined, title: m.title, handle: m.handle })) ).map((c) => {
                        const key = c.id || c.handle || c.title;
                        const isOpen = expandedCol === key;
                        const cats = catsByCollection[key] || [];
                        return (
                          <div key={key} className="">
                            <button
                              onClick={() => {
                                setExpandedCol(isOpen ? null : key);
                                if (!isOpen) ensureCatsForCollection(c);
                              }}
                              className="w-full flex items-center justify-between px-2 py-2 text-sm hover:bg-gray-100 rounded"
                              type="button"
                            >
                              <span className="truncate text-left">{c.title}</span>
                              <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                            </button>
                            {isOpen && (
                              <div className="pl-3 pb-2">
                                {cats.length ? (
                                  cats.map((cat) => (
                                    <button
                                      key={`${key}-${cat.title}`}
                                      onClick={() => {
                                        setSelectedFilter({ type: "category", title: cat.title, handle: cat.handle });
                                        setBrowseOpen(false);
                                        setExpandedCol(null);
                                      }}
                                      className="w-full text-left block px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-100 rounded"
                                      type="button"
                                    >
                                      {cat.title}
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-2 py-1.5 text-sm text-gray-500">No categories</div>
                                )}
                                <div className="mt-1">
                                  <button
                                    onClick={() => {
                                      setSelectedFilter({ type: "collection", title: c.title, handle: c.handle, id: c.id });
                                      setBrowseOpen(false);
                                      setExpandedCol(null);
                                    }}
                                    className="px-2 py-1.5 text-xs text-header-accent hover:underline"
                                    type="button"
                                  >
                                    Use entire collection
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex-1 flex relative">
                  <Input
                    type="text"
                    placeholder={selectedFilter ? `Search in ${selectedFilter.title}...` : "Search products..."}
                    className="rounded-r-none border-header-text/20"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setShowSuggest(true);
                    }}
                    onFocus={() => setShowSuggest(true)}
                  />
                  <Button className="rounded-l-none bg-header-accent hover:bg-header-accent/90 text-white" type="button">
                    <Search className="w-5 h-5" />
                  </Button>
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
              </div>
            </div>

            {/* Login/Signup Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <Link href="/login">
                <Button
                  variant="outline"
                  className="border-header-accent text-header-text hover:bg-header-accent hover:text-white transition-all duration-300"
                >
                  <User className="w-4 h-4 mr-2" />
                  Login
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="bg-header-accent hover:bg-header-accent/90 text-white">Sign Up</Button>
              </Link>
            </div>

            {/* Orders */}
            <div className="hidden lg:flex items-center gap-2 cursor-pointer group">
              <div className="text-right">
                <p className="text-xs text-header-text">Returns</p>
                <p className="text-sm font-medium text-header-text group-hover:text-header-accent transition-colors">& Orders</p>
              </div>
            </div>

            {/* Cart */}
            <Link href="/cart" className="flex items-center gap-2 cursor-pointer group">
              <div className="relative" data-browse-root>
                <ShoppingCart className="w-6 h-6 text-header-text group-hover:text-header-accent transition-colors" />
                <span className="absolute -top-2 -right-2 bg-header-accent text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">0</span>
              </div>
              <span className="hidden lg:block text-sm font-medium text-header-text group-hover:text-header-accent transition-colors">Cart</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Navigation Bar */}
      <nav className="bg-header-nav-bg">
        <div className="container mx-auto px-4">
          {/* make this container overflow-x but allow dropdowns via portal (portal prevents clipping) */}
          <div className="flex items-center gap-4 md:gap-6 overflow-x-auto overflow-y-visible py-1 relative">
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
                className="flex items-center gap-2 py-3 text-header-text hover:text-header-accent transition-colors whitespace-nowrap"
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
              navCategories.map((cat) => (
                <div
                  key={cat.id}
                  data-nav-category
                  className="relative flex-shrink-0 group"
                  onMouseEnter={() => { clearHideTimer(); setActiveCategoryId(cat.id); }}
                  onMouseLeave={() => startHideTimer()}
                >
                  <div
                    ref={(el: HTMLElement | null) => { triggersRef.current[cat.id] = el; }}
                    className="nav-link relative py-3 pr-6 md:pr-0 text-sm text-header-text font-medium whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
                    onClick={() => {
                      setSelectedFilter({ type: "category", title: cat.title, handle: cat.handle });
                    }}
                  >
                    <span className="truncate">{cat.title}</span>
                    <ChevronDown className="hidden md:inline-block w-3.5 h-3.5 text-header-muted transition group-hover:text-header-accent" />
                  </div>

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
              ))
            ) : (
              <div className="py-3 text-sm text-gray-500">No categories found.</div>
            )}
          </div>
        </div>
      </nav>

      {/* Render dropdown portals (so they're never clipped by nav overflow) */}
      <CategoryPortal />
      <AllPortal />

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
        }
      `}</style>
    </header>
  );
};

export default Header;
