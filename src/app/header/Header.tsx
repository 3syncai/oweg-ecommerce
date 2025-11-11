"use client";

import { MapPin, Search, ShoppingCart, User, Menu, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
import Link from "next/link";
import Image from "next/image";
import React from "react";

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

const Header = () => {
  const [collections, setCollections] = React.useState<{ id?: string; title: string; handle?: string; created_at?: string }[]>([])
  const [catsByCollection, setCatsByCollection] = React.useState<Record<string, { title: string; handle?: string }[]>>({})
  const [browseOpen, setBrowseOpen] = React.useState(false)
  const [expandedCol, setExpandedCol] = React.useState<string | null>(null)
  const [selectedFilter, setSelectedFilter] = React.useState<
    | { type: 'collection'; id?: string; handle?: string; title: string }
    | { type: 'category'; id?: string; handle?: string; title: string }
    | { type: 'all'; title: string }
    | null
  >({ type: 'all', title: 'All' })
  const [q, setQ] = React.useState("")
  const [suggestions, setSuggestions] = React.useState<{ id: string; name: string; image?: string }[]>([])
  const [showSuggest, setShowSuggest] = React.useState(false)
  
  // Handle click outside to close dropdowns
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const browseRoot = document.querySelector('[data-browse-root]');
      if (browseRoot && !browseRoot.contains(target)) {
        setBrowseOpen(false);
      }
      if (!target.closest('.relative.flex')) {
        setShowSuggest(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);
  

    React.useEffect(() => {
    let cancelled = false
    fetch('/api/medusa/collections')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        type Col = { id?: string; title?: string; name?: string; handle?: string; created_at?: string }
        type OutCol = { id?: string; title: string; handle?: string; created_at?: string }
        const cols = ((d.collections as Col[]) || [])
          .map<OutCol>((c) => ({ id: c.id, title: (c.title || c.name || '').toString(), handle: c.handle, created_at: c.created_at }))
          .filter((c) => !!c.title)
          .sort((a, b) => {
            const ad = a.created_at ? new Date(a.created_at).getTime() : 0
            const bd = b.created_at ? new Date(b.created_at).getTime() : 0
            if (ad && bd) return ad - bd // oldest first (admin created order)
            if (ad && !bd) return -1
            if (!ad && bd) return 1
            return String(a.title).localeCompare(String(b.title))
          })
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
    return () => { cancelled = true }
  }, [])

  function ensureCatsForCollection(col: { id?: string; handle?: string }) {
    const key = col.id || col.handle
    if (!key || catsByCollection[key]) return
    fetch(`/api/medusa/collections/${encodeURIComponent(key)}/categories`)
      .then(r => r.json())
      .then(d => {
        type Cat = { title?: string; name?: string; handle?: string }
        const arr = (d.categories as Cat[] || [])
          .map((c) => ({ title: (c.title || c.name || '').toString(), handle: c.handle }))
          .filter((c) => !!c.title)
        setCatsByCollection(prev => ({ ...prev, [key]: arr }))
      })
      .catch(() => {})
  }

  // Debounced suggestions
  React.useEffect(() => {
    const id = setTimeout(() => {
      if (q.trim().length < 2) { setSuggestions([]); return }
      const params = new URLSearchParams({ q })
      if (selectedFilter?.type === 'category') {
        if (selectedFilter.handle) params.append('category', selectedFilter.handle)
      } else if (selectedFilter?.type === 'collection') {
        if (selectedFilter.id) params.append('collectionId', selectedFilter.id)
        else if (selectedFilter.handle) params.append('collection', selectedFilter.handle)
      } else if (selectedFilter?.type === 'all') {
        // global search; no scoping param
      }
      fetch(`/api/medusa/search?${params.toString()}`)
        .then(r => r.json())
        .then(d => {
          type S = { id: string; name: string; image?: string }
          const list: S[] = (d.products as S[] || []).map((p) => ({ id: p.id, name: p.name, image: p.image }))
          setSuggestions(list)
        })
        .catch(() => setSuggestions([]))
    }, 250)
    return () => clearTimeout(id)
  }, [q, selectedFilter])

  return (
    <header className="w-full header-root">
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
                  <Image
                    src="/oweg_logo.png"
                    alt="OWEG"
                    width={100}
                    height={32}
                    className="h-8 w-auto"
                  />
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
                  >
                    <span className="truncate">{selectedFilter ? selectedFilter.title : 'Browse'}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${browseOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {browseOpen && (
                    <div className="absolute left-0 mt-2 z-50 bg-white rounded-md shadow-lg ring-1 ring-black/5 w-[320px] max-h-[70vh] overflow-auto p-1">
                      <div className="mb-1 border-b border-gray-100 pb-1">
                        <button
                          onClick={() => { setSelectedFilter({ type: 'all', title: 'All' }); setBrowseOpen(false); setExpandedCol(null) }}
                          className="w-full text-left px-2 py-2 text-sm hover:bg-gray-100 rounded"
                        >
                          All
                        </button>
                      </div>
                      {(collections.length ? collections : MENU_COLLECTIONS.map((m) => ({ id: undefined as undefined, title: m.title, handle: m.handle })) ).map((c) => {
              const key = c.id || c.handle || c.title
                        const isOpen = expandedCol === key
                        const cats = catsByCollection[key] || []
                        return (
                          <div key={key} className="">
                            <button
                              onClick={() => {
                                setExpandedCol(isOpen ? null : key)
                                if (!isOpen) ensureCatsForCollection(c)
                              }}
                              className="w-full flex items-center justify-between px-2 py-2 text-sm hover:bg-gray-100 rounded"
                            >
                              <span className="truncate text-left">{c.title}</span>
                              <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                            </button>
                            {isOpen && (
                              <div className="pl-3 pb-2">
                                {cats.length ? (
                                  cats.map((cat) => (
                                    <button
                                      key={`${key}-${cat.title}`}
                                      onClick={() => {
                                        setSelectedFilter({ type: 'category', title: cat.title, handle: cat.handle })
                                        setBrowseOpen(false)
                                        setExpandedCol(null)
                                      }}
                                      className="w-full text-left block px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-100 rounded"
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
                                      setSelectedFilter({ type: 'collection', title: c.title, handle: c.handle, id: c.id })
                                      setBrowseOpen(false)
                                      setExpandedCol(null)
                                    }}
                                    className="px-2 py-1.5 text-xs text-header-accent hover:underline"
                                  >
                                    Use entire collection
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="flex-1 flex relative">
                  <Input
                    type="text"
                    placeholder={selectedFilter ? `Search in ${selectedFilter.title}...` : 'Search products...'}
                    className="rounded-r-none border-header-text/20"
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setShowSuggest(true) }}
                    onFocus={() => setShowSuggest(true)}
                  />
                  <Button className="rounded-l-none bg-header-accent hover:bg-header-accent/90 text-white">
                    <Search className="w-5 h-5" />
                  </Button>
                  {showSuggest && q.length >= 2 && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 z-50 w-full bg-white rounded-md shadow-lg ring-1 ring-black/5 max-h-[60vh] overflow-auto">
                      {suggestions.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                          {s.image ? (
                            <Image src={s.image} alt={s.name} width={36} height={36} className="rounded object-cover" />
                          ) : (
                            <div className="w-9 h-9 bg-gray-200 rounded" />
                          )}
                          <div className="text-sm text-gray-800 truncate">{s.name}</div>
                        </div>
                      ))}
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
                <Button className="bg-header-accent hover:bg-header-accent/90 text-white">
                  Sign Up
                </Button>
              </Link>
            </div>

            {/* Orders */}
            <div className="hidden lg:flex items-center gap-2 cursor-pointer group">
              <div className="text-right">
                <p className="text-xs text-header-text">Returns</p>
                <p className="text-sm font-medium text-header-text group-hover:text-header-accent transition-colors">
                  & Orders
                </p>
              </div>
            </div>

            {/* Cart */}
            <Link href="/cart" className="flex items-center gap-2 cursor-pointer group">
              <div className="relative" data-browse-root>
                <ShoppingCart className="w-6 h-6 text-header-text group-hover:text-header-accent transition-colors" />
                <span className="absolute -top-2 -right-2 bg-header-accent text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  0
                </span>
              </div>
              <span className="hidden lg:block text-sm font-medium text-header-text group-hover:text-header-accent transition-colors">
                Cart
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Navigation Bar */}
      <nav className="bg-header-nav-bg">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-6 overflow-visible">
            {/* All Button */}
            <button className="flex items-center gap-2 py-3 text-header-text hover:text-header-accent transition-colors whitespace-nowrap">
              <Menu className="w-5 h-5" />
              <span className="font-medium">All</span>
            </button>

            {/* Collection Links */}
            {(collections.length ? collections : MENU_COLLECTIONS.map((m) => ({ id: undefined as undefined, title: m.title, handle: m.handle })) ).map((c) => (
              <div key={c.title} className="relative group" onMouseEnter={() => ensureCatsForCollection(c)}>
                <a
                  href={c.handle ? `/collections/${c.handle}` : "#"}
                  className="nav-link relative py-3 text-sm text-header-text font-medium whitespace-nowrap transition-colors"
                >
                  {c.title}
                </a>
                {/* Dropdown: show categories on hover */}
                <div className="absolute left-0 top-full mt-1 hidden group-hover:block z-50">
                  <div className="min-w-[240px] max-h-[60vh] overflow-auto rounded-md bg-white shadow-lg ring-1 ring-black/5 p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {((catsByCollection[c.id || c.handle || ''] || [])).map((cat) => (
                      <a
                        key={`${c.title}-${cat.title}`}
                        href={cat.handle ? `/c/${cat.handle}` : "#"}
                        className="block rounded px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
                      >
                        {cat.title}
                      </a>
                    ))}
                    {(!catsByCollection[c.id || c.handle || ''] || (catsByCollection[c.id || c.handle || '']?.length === 0)) && (
                      <div className="px-3 py-2 text-sm text-gray-500">No categories</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* Internal styles (no external file) */}
      <style jsx global>{`
        /* Font (place the file at /public/fonts/OPTIHandelGothic-Light.woff2 for best result) */
        @font-face {
          font-family: "OPTIHandelGothic-Light";
          src: url("/fonts/OPTIHandelGothic-Light.woff2") format("woff2");
          font-weight: 300;
          font-style: normal;
          font-display: swap;
        }

        :root {
          --header-accent: #7AC943;
          --header-top-bg: #000000; /* top promo bar */
          --header-top-text: #ffffff;
          --header-bg: #ffffff; /* main header background */
          --header-nav-bg: #efefef; /* nav background */
          --header-text: #111827; /* main header text */
          --header-muted: #6b7280;
          
        }

        /* Root header font + base */
        .header-root {
          font-family: "OPTIHandelGothic-Light", ui-sans-serif, system-ui, -apple-system,
            "Segoe UI", Roboto, "Helvetica Neue", Arial;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
          .header-root button,
.header-root .cursor-pointer {
  cursor: pointer !important;
}

        /* map utility classes used in markup */
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
        .text-header-accent {
          color: var(--header-accent);
        }
        .bg-header-accent {
          background: var(--header-accent);
        }

        /* Logo link hover: subtle upward move and accent on text if any */
        .logo-link:hover {
          transform: translateY(-2px);
          transition: transform 220ms ease;
        }

        /* Location block slightly muted */
        .location-block .text-header-text {
          color: var(--header-text);
        }
        .location-block .text-header-text:first-child {
          color: var(--header-muted);
        }

        /* NAV links: custom underline + hover color */
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

        /* Top promo link hover */
        .bg-header-top-bg a:hover {
          color: var(--header-accent) !important;
        }

        /* Orders / Cart hover color already uses group-hover; ensure default text color */
        .group-hover\\:text-header-accent:hover,
        .group:hover .group-hover\\:text-header-accent {
          color: var(--header-accent);
        }

        /* select / input colors: ensure placeholder & border subtle */
        input::placeholder {
          color: rgba(0, 0, 0, 0.45);
        }

        /* small responsive tweaks - keep underline close to text on small screens */
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
