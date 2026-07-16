"use client"

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useMemo, useState } from "react"
import { Container, Heading, Text, Button, Badge, Input, Label, Checkbox, IconButton } from "@medusajs/ui"
import { Plus, ClockSolid, MagnifyingGlass, XMark, Trash, Bolt, Funnel } from "@medusajs/icons"
import { getAdminBackendUrl } from "../../lib/admin-backend"

type FlashSaleItem = {
  id: string
  product_id: string
  variant_id: string
  product_title: string
  product_thumbnail?: string | null
  // 'published' = visible on storefront, 'draft' / 'proposed' / 'rejected'
  // = hidden. Set to 'deleted' by the API when the underlying product no
  // longer exists at all.
  product_status?: "draft" | "proposed" | "published" | "rejected" | "deleted"
  flash_sale_price: number
  original_price: number
  expires_at: string | Date
  created_at: string | Date
  updated_at: string | Date
  is_active: boolean
  // is_active AND product is currently published. This mirrors the
  // storefront visibility rule so admins see exactly what customers see.
  is_live?: boolean
  time_remaining_ms: number
}

type Product = {
  id: string
  title: string
  thumbnail?: string | null
  price: number
  variant_id?: string
}

type Category = {
  id: string
  name: string
}

type Collection = {
  id: string
  title: string
}

type ProductType = {
  id: string
  value: string
}

const FlashSalePage = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [types, setTypes] = useState<ProductType[]>([])
  const [flashSaleItems, setFlashSaleItems] = useState<FlashSaleItem[]>([])
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [selectedCollection, setSelectedCollection] = useState("")
  const [selectedType, setSelectedType] = useState("")
  
  // Form data
  const [formData, setFormData] = useState({
    title: "",
    enabled: true,
    start_time: "",
    end_time: "",
    selectedProducts: new Map<string, { price: number; originalPrice: number }>(),
  })

  // UI state: which subset of the active-flash-sales list to show + the bulk
  // discount percent the admin can apply across all selected products in
  // one click.
  const [listFilter, setListFilter] = useState<"all" | "live" | "hidden" | "expired">("all")
  const [bulkDiscountPct, setBulkDiscountPct] = useState<number>(20)

  useEffect(() => {
    loadFlashSales()
    loadCategories()
    loadCollections()
    loadTypes()
    loadProducts()
  }, [])

  useEffect(() => {
    loadProducts()
  }, [searchQuery, selectedCategory, selectedCollection, selectedType])

  const loadFlashSales = async () => {
    try {
      const backend = getAdminBackendUrl()
      const response = await fetch(`${backend}/admin/flash-sale`, {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setFlashSaleItems(data.flash_sale_items || [])
      }
    } catch (error) {
      console.error("Failed to fetch flash sales:", error)
    }
  }

  const loadCategories = async () => {
    try {
      const backend = getAdminBackendUrl()
      const response = await fetch(`${backend}/admin/product-categories?limit=100`, {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setCategories((data.product_categories || data.categories || []).map((cat: any) => ({
          id: cat.id,
          name: cat.name || cat.title || "",
        })))
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error)
    }
  }

  const loadCollections = async () => {
    try {
      const backend = getAdminBackendUrl()
      const response = await fetch(`${backend}/admin/collections?limit=100`, {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setCollections((data.collections || []).map((col: any) => ({
          id: col.id,
          title: col.title || col.name || "",
        })))
      }
    } catch (error) {
      console.error("Failed to fetch collections:", error)
    }
  }

  const loadTypes = async () => {
    try {
      const backend = getAdminBackendUrl()
      const response = await fetch(`${backend}/admin/product-types?limit=100`, {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setTypes((data.product_types || []).map((type: any) => ({
          id: type.id,
          value: type.value || type.name || "",
        })))
      }
    } catch (error) {
      console.error("Failed to fetch types:", error)
    }
  }

  const loadProducts = async () => {
    setLoading(true)
    try {
      const backend = getAdminBackendUrl()
      const params = new URLSearchParams()
      
      if (searchQuery) params.set("search", searchQuery)
      if (selectedCategory) params.set("category", selectedCategory)
      if (selectedCollection) params.set("collection", selectedCollection)
      if (selectedType) params.set("type", selectedType)
      
      const response = await fetch(`${backend}/admin/flash-sale/products?${params.toString()}`, {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setProducts(data.products || [])
      }
    } catch (error) {
      console.error("Failed to fetch products:", error)
    } finally {
      setLoading(false)
    }
  }


  const handleProductToggle = (product: Product) => {
    const newSelected = new Map(formData.selectedProducts)
    
    if (newSelected.has(product.id)) {
      newSelected.delete(product.id)
    } else {
      newSelected.set(product.id, {
        price: product.price, // Flash sale price (starts same as original)
        originalPrice: product.price, // Original price from product
      })
    }
    
    setFormData({ ...formData, selectedProducts: newSelected })
  }

  const handlePriceChange = (productId: string, price: number) => {
    const newSelected = new Map(formData.selectedProducts)
    const existing = newSelected.get(productId)
    if (existing) {
      newSelected.set(productId, {
        ...existing,
        price: price,
      })
      setFormData({ ...formData, selectedProducts: newSelected })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.selectedProducts.size === 0) {
      alert("Please select at least one product")
      return
    }
    
    if (!formData.end_time) {
      alert("Please set an end time for the flash sale")
      return
    }
    
    setSaving(true)
    
    try {
      const backend = getAdminBackendUrl()
      
      // Create items with variant_id, flash_sale_price, original_price, and expires_at
      const items = Array.from(formData.selectedProducts.entries()).map(([productId, data]) => {
        // Find the product to get variant_id
        const product = products.find(p => p.id === productId)
        
        return {
          product_id: productId,
          variant_id: product?.variant_id || null, // Will be fetched server-side if not provided
          flash_sale_price: data.price,
          original_price: data.originalPrice,
          expires_at: new Date(formData.end_time).toISOString(),
        }
      })
      
      const payload = {
        items,
      }

      const response = await fetch(`${backend}/admin/flash-sale`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        await loadFlashSales()
        resetForm()
        alert("Flash sale saved successfully!")
      } else {
        const error = await response.json()
        alert(`Error: ${error.message || "Failed to save flash sale"}`)
      }
    } catch (error) {
      console.error("Failed to save flash sale:", error)
      alert("Failed to save flash sale")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this flash sale?")) return

    try {
      const backend = getAdminBackendUrl()
      const response = await fetch(`${backend}/admin/flash-sale/${id}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (response.ok) {
        await loadFlashSales()
        alert("Flash sale deleted successfully!")
      } else {
        alert("Failed to delete flash sale")
      }
    } catch (error) {
      console.error("Failed to delete flash sale:", error)
      alert("Failed to delete flash sale")
    }
  }

  const resetForm = () => {
    setFormData({
      title: "",
      enabled: true,
      start_time: "",
      end_time: "",
      selectedProducts: new Map(),
    })
  }

  const formatDate = (dateString: string | Date) => {
    if (!dateString) return "Not set"
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return String(dateString)
    }
  }

  const formatTimeRemaining = (timeRemainingMs: number) => {
    if (timeRemainingMs <= 0) return "Expired"
    
    const days = Math.floor(timeRemainingMs / (1000 * 60 * 60 * 24))
    const hours = Math.floor((timeRemainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((timeRemainingMs % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((timeRemainingMs % (1000 * 60)) / 1000)
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
  }

  const calculateDiscount = (original: number, flashSale: number) => {
    if (!original || original === 0) return 0
    return Math.round(((original - flashSale) / original) * 100)
  }

  // Apply a single discount percent across every currently-selected product.
  // Lets the admin set, say, 30% off everything in two clicks instead of
  // typing a price per product.
  const applyBulkDiscount = (pct: number) => {
    if (formData.selectedProducts.size === 0) return
    const safePct = Math.min(Math.max(pct, 0), 100)
    const next = new Map(formData.selectedProducts)
    next.forEach((data, productId) => {
      const newPrice = Math.max(
        0,
        Math.round((data.originalPrice * (1 - safePct / 100)) * 100) / 100
      )
      next.set(productId, { price: newPrice, originalPrice: data.originalPrice })
    })
    setFormData({ ...formData, selectedProducts: next })
  }

  // Fallback avatar character when a product has no thumbnail image.
  const getInitial = (title?: string) => (title?.trim()[0] || "?").toUpperCase()

  // Aggregate counts for the dashboard chips and the filter tabs.
  const counts = useMemo(() => {
    let live = 0
    let hidden = 0
    let expired = 0
    for (const item of flashSaleItems) {
      if (item.is_live) live++
      else if (item.is_active) hidden++
      else expired++
    }
    return { live, hidden, expired, total: flashSaleItems.length }
  }, [flashSaleItems])

  const visibleFlashSales = useMemo(() => {
    if (listFilter === "live") return flashSaleItems.filter((i) => i.is_live)
    if (listFilter === "hidden") return flashSaleItems.filter((i) => i.is_active && !i.is_live)
    if (listFilter === "expired") return flashSaleItems.filter((i) => !i.is_active)
    return flashSaleItems
  }, [flashSaleItems, listFilter])

  const totalSelectedSavings = useMemo(() => {
    let savings = 0
    formData.selectedProducts.forEach((data) => {
      savings += Math.max(0, data.originalPrice - data.price)
    })
    return savings
  }, [formData.selectedProducts])

  if (loading && products.length === 0) {
    return (
      <Container className="divide-y p-0">
        {/* Skeleton header */}
        <div className="px-6 py-5">
          <div className="h-7 w-56 rounded-md bg-ui-bg-base-hover animate-pulse mb-2" />
          <div className="h-4 w-80 rounded-md bg-ui-bg-base-hover/70 animate-pulse" />
        </div>
        {/* Skeleton stat row */}
        <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-ui-bg-base-hover animate-pulse" />
          ))}
        </div>
        {/* Skeleton form */}
        <div className="px-6 py-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 w-full rounded-lg bg-ui-bg-base-hover animate-pulse" />
          ))}
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-ui-bg-base-hover animate-pulse" />
            ))}
          </div>
          <div className="h-72 rounded-xl bg-ui-bg-base-hover animate-pulse" />
        </div>
      </Container>
    )
  }

  return (
    <Container className="divide-y p-0">
      {/* Page header with brand-accent banner + KPI chips */}
      <div className="relative px-6 py-6 bg-gradient-to-br from-orange-100 via-amber-50 to-white dark:from-orange-950/60 dark:via-amber-950/40 dark:to-transparent overflow-hidden">
        {/* Soft orange glow blobs to lift the dark-mode banner */}
        <div className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full bg-orange-500/10 dark:bg-orange-500/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 w-72 h-72 rounded-full bg-amber-400/10 dark:bg-amber-500/10 blur-3xl" aria-hidden />

        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/30 ring-1 ring-orange-400/50">
              <Bolt />
            </div>
            <div>
              <Heading level="h1" className="text-orange-700 dark:text-orange-300">
                Flash Sale Management
              </Heading>
              <Text className="text-ui-fg-subtle">
                Run time-boxed promotions on individual products
              </Text>
            </div>
          </div>
          <Button variant="primary" onClick={resetForm}>
            <Plus /> Create New Flash Sale
          </Button>
        </div>

        {/* KPI row */}
        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <button
            type="button"
            onClick={() => setListFilter("live")}
            className={`text-left rounded-xl border p-4 transition shadow-sm hover:shadow-md backdrop-blur-sm ${listFilter === "live"
              ? "border-emerald-500 ring-2 ring-emerald-300/50 dark:ring-emerald-700/60 bg-white dark:bg-emerald-950/40"
              : "border-ui-border-base bg-white/90 dark:bg-ui-bg-base/80 hover:border-emerald-300 dark:hover:border-emerald-800"
              }`}
          >
            <div className="flex items-center justify-between">
              <Text size="xsmall" className="uppercase tracking-wide text-ui-fg-subtle">Live now</Text>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 mt-1">{counts.live}</div>
          </button>

          <button
            type="button"
            onClick={() => setListFilter("hidden")}
            className={`text-left rounded-xl border p-4 transition shadow-sm hover:shadow-md backdrop-blur-sm ${listFilter === "hidden"
              ? "border-amber-500 ring-2 ring-amber-300/50 dark:ring-amber-700/60 bg-white dark:bg-amber-950/40"
              : "border-ui-border-base bg-white/90 dark:bg-ui-bg-base/80 hover:border-amber-300 dark:hover:border-amber-800"
              }`}
          >
            <div className="flex items-center justify-between">
              <Text size="xsmall" className="uppercase tracking-wide text-ui-fg-subtle">Hidden (draft)</Text>
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            </div>
            <div className="text-2xl font-semibold text-amber-600 dark:text-amber-400 mt-1">{counts.hidden}</div>
          </button>

          <button
            type="button"
            onClick={() => setListFilter("expired")}
            className={`text-left rounded-xl border p-4 transition shadow-sm hover:shadow-md backdrop-blur-sm ${listFilter === "expired"
              ? "border-gray-400 ring-2 ring-gray-300/50 dark:ring-gray-700/60 bg-white dark:bg-ui-bg-base"
              : "border-ui-border-base bg-white/90 dark:bg-ui-bg-base/80 hover:border-gray-300 dark:hover:border-gray-700"
              }`}
          >
            <div className="flex items-center justify-between">
              <Text size="xsmall" className="uppercase tracking-wide text-ui-fg-subtle">Expired</Text>
              <span className="w-2 h-2 rounded-full bg-gray-400" />
            </div>
            <div className="text-2xl font-semibold text-ui-fg-subtle mt-1">{counts.expired}</div>
          </button>

          {/* Total Items is the brand-accent card — always tinted orange so the
              flash-sale identity is anchored even in dark mode. */}
          <button
            type="button"
            onClick={() => setListFilter("all")}
            className={`text-left rounded-xl border p-4 transition shadow-sm hover:shadow-md backdrop-blur-sm ${listFilter === "all"
              ? "border-orange-500 ring-2 ring-orange-300/60 dark:ring-orange-600/70 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/60 dark:to-amber-950/40"
              : "border-orange-300 dark:border-orange-900 bg-gradient-to-br from-orange-50/60 to-amber-50/40 dark:from-orange-950/30 dark:to-amber-950/20 hover:border-orange-400 dark:hover:border-orange-700"
              }`}
          >
            <div className="flex items-center justify-between">
              <Text size="xsmall" className="uppercase tracking-wide text-orange-700 dark:text-orange-300 font-semibold">
                Total items
              </Text>
              <span className="text-orange-500 dark:text-orange-400">
                <Funnel />
              </span>
            </div>
            <div className="text-2xl font-semibold text-orange-600 dark:text-orange-300 mt-1">{counts.total}</div>
          </button>
        </div>
      </div>


      {/* Flash Sale Form */}
      <div className="px-6 py-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center text-sm font-bold shadow-md shadow-orange-500/20 ring-1 ring-orange-400/40">
            1
          </div>
          <Heading level="h2">
            Create Flash Sale
          </Heading>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label>Title (Optional)</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Flash Sale Title"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked as boolean })}
              />
              <Label>Enabled</Label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Time</Label>
                <Input
                  type="datetime-local"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>End Time</Label>
                <Input
                  type="datetime-local"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                />
              </div>
            </div>
          </div>

          {/* Product Filters */}
          <div className="space-y-4 border-t border-ui-border-base pt-5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center text-sm font-bold shadow-md shadow-orange-500/20 ring-1 ring-orange-400/40">
                2
              </div>
              <Heading level="h3">Filter Products</Heading>
              <Text size="small" className="text-ui-fg-subtle ml-1">
                only published products are shown
              </Text>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Search</Label>
                <div className="relative">
                  <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-muted pointer-events-none" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products..."
                    className="pl-9 pr-9"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-full text-ui-fg-muted hover:text-ui-fg-base hover:bg-ui-bg-base-hover"
                    >
                      <XMark />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <Label>Category</Label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-ui-border-base bg-ui-bg-base rounded-md text-ui-fg-base focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/50 transition"
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Collection</Label>
                <select
                  value={selectedCollection}
                  onChange={(e) => setSelectedCollection(e.target.value)}
                  className="w-full px-3 py-2 border border-ui-border-base bg-ui-bg-base rounded-md text-ui-fg-base focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/50 transition"
                >
                  <option value="">All Collections</option>
                  {collections.map((col) => (
                    <option key={col.id} value={col.id}>{col.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Type</Label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-3 py-2 border border-ui-border-base bg-ui-bg-base rounded-md text-ui-fg-base focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/50 transition"
                >
                  <option value="">All Types</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>{type.value}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Product Selection with Prices */}
          <div className="space-y-4 border-t border-ui-border-base pt-5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center text-sm font-bold shadow-md shadow-orange-500/20 ring-1 ring-orange-400/40">
                3
              </div>
              <Heading level="h3">
                Select Products
              </Heading>
              {formData.selectedProducts.size > 0 && (
                <Badge color="orange">{formData.selectedProducts.size} selected</Badge>
              )}
              <Text size="small" className="text-ui-fg-subtle ml-auto">
                Set price per product or apply a bulk discount
              </Text>
            </div>

            {/* Bulk discount apply bar — only useful when something is picked */}
            {formData.selectedProducts.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap rounded-xl border border-orange-300 dark:border-orange-800 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 dark:from-orange-950/50 dark:via-amber-950/40 dark:to-orange-950/50 p-3 shadow-sm">
                <Text size="small" className="font-semibold text-orange-700 dark:text-orange-300">
                  Bulk discount:
                </Text>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={bulkDiscountPct}
                    onChange={(e) => setBulkDiscountPct(Number(e.target.value) || 0)}
                    className="w-20"
                  />
                  <Text className="text-ui-fg-subtle">% off</Text>
                </div>
                <div className="flex items-center gap-1.5">
                  {[10, 25, 50].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBulkDiscountPct(preset)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition ${bulkDiscountPct === preset
                        ? "border-orange-500 bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/20"
                        : "border-orange-200 dark:border-orange-900 text-orange-700 dark:text-orange-300 bg-white/60 dark:bg-ui-bg-base/40 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40"
                        }`}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => applyBulkDiscount(bulkDiscountPct)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-gradient-to-br from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-sm shadow-orange-500/30 transition"
                >
                  Apply to all selected
                </button>
                <div className="ml-auto text-sm text-ui-fg-subtle">
                  Total savings:{" "}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    ₹{totalSelectedSavings.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            )}

            <div className="border border-orange-200 dark:border-orange-900/40 rounded-xl p-2 max-h-[28rem] overflow-y-auto bg-gradient-to-b from-orange-50/40 to-transparent dark:from-orange-950/20 dark:to-transparent">
              {products.length === 0 ? (
                <div className="p-8 text-center">
                  <Text className="text-ui-fg-subtle">
                    No products found. Try adjusting the filters above.
                  </Text>
                </div>
              ) : (
                <div className="space-y-2">
                  {products.map((product) => {
                    const isSelected = formData.selectedProducts.has(product.id)
                    const priceData = formData.selectedProducts.get(product.id)
                    const currentDiscount = priceData && product.price > 0
                      ? Math.round(((product.price - priceData.price) / product.price) * 100)
                      : 0

                    return (
                      <div
                        key={product.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition ${isSelected
                          ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 shadow-sm"
                          : "bg-ui-bg-base border-ui-border-base hover:border-ui-border-strong"
                          }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleProductToggle(product)}
                        />
                        {/* Thumbnail / initial avatar */}
                        {product.thumbnail ? (
                          <img
                            src={product.thumbnail}
                            alt={product.title}
                            className="w-12 h-12 object-cover rounded-lg border border-ui-border-base"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-orange-200 to-amber-200 dark:from-orange-900 dark:to-amber-900 flex items-center justify-center text-sm font-bold text-orange-800 dark:text-orange-200">
                            {getInitial(product.title)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <Text className="font-medium truncate">{product.title}</Text>
                          <Text className="text-xs text-ui-fg-subtle">
                            Current: ₹{product.price.toLocaleString("en-IN")}
                          </Text>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-3">
                            <div>
                              <Label className="text-xs">Flash price (₹)</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={priceData?.price ?? product.price}
                                onChange={(e) => handlePriceChange(product.id, parseFloat(e.target.value) || 0)}
                                className="w-28"
                              />
                            </div>
                            <Badge
                              color={
                                currentDiscount >= 50
                                  ? "red"
                                  : currentDiscount >= 20
                                    ? "orange"
                                    : currentDiscount > 0
                                      ? "green"
                                      : "grey"
                              }
                            >
                              {currentDiscount}% off
                            </Badge>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-ui-border-base pt-5">
            <Button type="submit" variant="primary" disabled={saving || formData.selectedProducts.size === 0}>
              {saving ? "Saving..." : "Create"} Flash Sale
              {formData.selectedProducts.size > 0 && (
                <span className="ml-1 opacity-80">({formData.selectedProducts.size})</span>
              )}
            </Button>
            <Button type="button" variant="secondary" onClick={resetForm} disabled={saving}>
              Reset
            </Button>
            {formData.selectedProducts.size === 0 && (
              <Text size="small" className="text-ui-fg-subtle ml-2">
                Select at least one product to continue
              </Text>
            )}
          </div>
          </form>
        </div>

        {/* Active Flash Sales List */}
        {flashSaleItems.length > 0 && (
          <div className="px-6 py-6 border-t border-ui-border-base">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-6 rounded-full bg-gradient-to-b from-orange-500 to-amber-500" aria-hidden />
                <Heading level="h2">Flash Sales</Heading>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-ui-bg-base-hover dark:bg-ui-bg-subtle border border-ui-border-base">
                {([
                  ["all", "All", counts.total],
                  ["live", "Live", counts.live],
                  ["hidden", "Hidden", counts.hidden],
                  ["expired", "Expired", counts.expired],
                ] as const).map(([key, label, value]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setListFilter(key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${listFilter === key
                      ? key === "all"
                        ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/20"
                        : "bg-white dark:bg-ui-bg-base text-ui-fg-base shadow-sm"
                      : "text-ui-fg-subtle hover:text-ui-fg-base"
                      }`}
                  >
                    {label}
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${listFilter === key && key === "all"
                      ? "bg-white/25 text-white"
                      : "bg-ui-bg-base-hover/80 dark:bg-ui-bg-base"
                      }`}>
                      {value}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {visibleFlashSales.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ui-border-base p-10 text-center">
                <Text className="text-ui-fg-subtle">
                  No items in this view.
                </Text>
              </div>
            ) : (
            <div className="space-y-4">
              {visibleFlashSales.map((item) => {
                const discount = calculateDiscount(item.original_price, item.flash_sale_price)
                const savings = Math.max(0, item.original_price - item.flash_sale_price)
                return (
                  <div
                    key={item.id}
                    className={`relative rounded-xl border p-4 transition-shadow hover:shadow-md ${item.is_live
                      ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-ui-bg-base'
                      : item.is_active
                        ? 'border-amber-400 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/40 dark:to-ui-bg-base'
                        : 'border-ui-border-base bg-ui-bg-subtle dark:bg-ui-bg-base'
                      }`}
                  >
                    {/* Status accent bar on the left edge */}
                    <span
                      className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${item.is_live
                        ? 'bg-emerald-500'
                        : item.is_active
                          ? 'bg-amber-500'
                          : 'bg-gray-400'
                        }`}
                      aria-hidden
                    />

                    <div className="flex items-start justify-between gap-4 pl-2">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {item.product_thumbnail ? (
                          <img
                            src={item.product_thumbnail}
                            alt={item.product_title}
                            className="w-20 h-20 object-cover rounded-lg border border-ui-border-base flex-shrink-0"
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-orange-200 to-amber-200 dark:from-orange-900 dark:to-amber-900 flex items-center justify-center text-xl font-bold text-orange-800 dark:text-orange-200 flex-shrink-0">
                            {getInitial(item.product_title)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {/* Status row */}
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            {item.is_live ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Live
                              </span>
                            ) : item.is_active ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-xs font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                {item.product_status === "deleted"
                                  ? "Hidden — product deleted"
                                  : `Hidden — product ${item.product_status || "unpublished"}`}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                                Expired
                              </span>
                            )}
                            {item.product_status && item.product_status !== "deleted" && (
                              <Badge
                                color={item.product_status === "published" ? "green" : "grey"}
                                size="2xsmall"
                              >
                                {item.product_status}
                              </Badge>
                            )}
                          </div>
                          <Heading level="h3" className="text-base leading-snug truncate">
                            {item.product_title}
                          </Heading>
                          <div className="flex items-center gap-3 text-xs text-ui-fg-subtle mt-1 flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <ClockSolid className="w-3.5 h-3.5" />
                              Expires {formatDate(item.expires_at)}
                            </span>
                            {item.is_active && (
                              <span className={`font-semibold ${item.is_live ? "text-emerald-600" : "text-amber-700"}`}>
                                {formatTimeRemaining(item.time_remaining_ms)} left
                              </span>
                            )}
                          </div>

                          {/* Price strip */}
                          <div className="flex items-end gap-5 mt-3 flex-wrap">
                            <div>
                              <Text size="xsmall" className="text-ui-fg-subtle uppercase tracking-wide">Was</Text>
                              <Text className="text-sm line-through text-ui-fg-muted">
                                ₹{Number(item.original_price).toLocaleString("en-IN")}
                              </Text>
                            </div>
                            <div>
                              <Text size="xsmall" className="text-ui-fg-subtle uppercase tracking-wide">Now</Text>
                              <Text className="text-xl font-bold text-emerald-600 leading-none">
                                ₹{Number(item.flash_sale_price).toLocaleString("en-IN")}
                              </Text>
                            </div>
                            <div>
                              <Text size="xsmall" className="text-ui-fg-subtle uppercase tracking-wide">Discount</Text>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-sm font-semibold ${discount >= 50
                                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                : discount >= 20
                                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                }`}>
                                {discount}% OFF
                              </span>
                            </div>
                            <div>
                              <Text size="xsmall" className="text-ui-fg-subtle uppercase tracking-wide">You save</Text>
                              <Text className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                                ₹{savings.toLocaleString("en-IN")}
                              </Text>
                            </div>
                          </div>
                        </div>
                      </div>
                      <IconButton
                        type="button"
                        variant="transparent"
                        onClick={() => handleDelete(item.id)}
                        aria-label="Delete flash sale"
                        className="text-ui-fg-subtle hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash />
                      </IconButton>
                    </div>
                  </div>
                )
              })}
            </div>
            )}
          </div>
        )}
      </Container>
    )
  }
  
  export const config = defineRouteConfig({
    label: "Flash Sales",
    icon: Bolt,
  })
  
  export default FlashSalePage
