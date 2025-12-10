"use client"

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { Container, Heading, Text, Button, Badge, Input, Label, Checkbox } from "@medusajs/ui"
import { Plus, ClockSolid } from "@medusajs/icons"

type FlashSaleProduct = {
  product_id: string
  flash_sale_price: number
  original_price: number
}

type FlashSaleItem = {
  id: string
  product_id: string
  variant_id: string
  product_title: string
  product_thumbnail?: string | null
  flash_sale_price: number
  original_price: number
  expires_at: string | Date
  created_at: string | Date
  updated_at: string | Date
  is_active: boolean
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
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
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
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
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
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
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
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
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
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
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
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
      
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
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
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

  if (loading && products.length === 0) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-8 text-center">
          <Text>Loading...</Text>
        </div>
      </Container>
    )
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Flash Sale Management</Heading>
          <Text className="text-ui-fg-subtle">Create and manage flash sale campaigns with individual pricing</Text>
        </div>
        <Button variant="primary" onClick={resetForm}>
          <Plus /> Create New Flash Sale
        </Button>
      </div>


      {/* Flash Sale Form */}
      <div className="px-6 py-4">
        <Heading level="h2" className="mb-4">
          Create Flash Sale
        </Heading>
        
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
          <div className="space-y-4 border-t pt-4">
            <Heading level="h3">Filter Products</Heading>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Search</Label>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                />
              </div>
              <div>
                <Label>Category</Label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <Heading level="h3">
                Select Products ({formData.selectedProducts.size} selected)
              </Heading>
              <Text className="text-sm text-ui-fg-subtle">
                Set individual flash sale price for each product
              </Text>
            </div>
            
            <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
              {products.length === 0 ? (
                <Text className="text-ui-fg-subtle">No products found. Try adjusting filters.</Text>
              ) : (
                <div className="space-y-3">
                  {products.map((product) => {
                    const isSelected = formData.selectedProducts.has(product.id)
                    const priceData = formData.selectedProducts.get(product.id)
                    
                    return (
                      <div
                        key={product.id}
                        className={`flex items-center gap-4 p-3 border rounded-lg ${
                          isSelected ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700" : "bg-ui-bg-base"
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleProductToggle(product)}
                        />
                        <div className="flex-1">
                          <Text className="font-medium">{product.title}</Text>
                          <Text className="text-sm text-ui-fg-subtle">
                            Current Price: ₹{product.price.toLocaleString('en-IN')}
                          </Text>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-2">
                            <div>
                              <Label className="text-xs">Flash Sale Price (₹)</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={priceData?.price || product.price}
                                onChange={(e) => handlePriceChange(product.id, parseFloat(e.target.value) || 0)}
                                className="w-32"
                              />
                            </div>
                            <div className="text-sm text-ui-fg-subtle">
                              <Text>Original: ₹{product.price.toLocaleString('en-IN')}</Text>
                              <Text className="text-green-600">
                                Discount: {priceData && product.price > 0 
                                  ? Math.round(((product.price - priceData.price) / product.price) * 100)
                                  : 0}%
                              </Text>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 border-t pt-4">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving..." : "Create"} Flash Sale
            </Button>
          </div>
          </form>
        </div>

        {/* Active Flash Sales List */}
        {flashSaleItems.length > 0 && (
          <div className="px-6 py-6 border-t">
            <Heading level="h2" className="mb-4">Active Flash Sales</Heading>
            <div className="space-y-4">
              {flashSaleItems.map((item) => {
                const discount = calculateDiscount(item.original_price, item.flash_sale_price)
                return (
                  <div 
                    key={item.id} 
                    className={`border rounded-lg p-4 ${item.is_active ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-gray-300 bg-gray-50 dark:bg-gray-900'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          {item.product_thumbnail && (
                            <img 
                              src={item.product_thumbnail} 
                              alt={item.product_title}
                              className="w-16 h-16 object-cover rounded"
                            />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Heading level="h3" className="text-lg">{item.product_title}</Heading>
                              {item.is_active ? (
                                <Badge color="green">Active</Badge>
                              ) : (
                                <Badge color="grey">Expired</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-ui-fg-subtle">
                              <div className="flex items-center gap-2">
                                <ClockSolid className="w-4 h-4" />
                                <Text>Expires: {formatDate(item.expires_at)}</Text>
                              </div>
                              {item.is_active && (
                                <Text className="font-semibold text-green-600">
                                  ⏰ {formatTimeRemaining(item.time_remaining_ms)}
                                </Text>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-3">
                          <div>
                            <Text className="text-sm text-ui-fg-subtle">Original Price</Text>
                            <Text className="text-lg font-semibold line-through text-gray-500">
                              ₹{item.original_price}
                            </Text>
                          </div>
                          <div>
                            <Text className="text-sm text-ui-fg-subtle">Flash Sale Price</Text>
                            <Text className="text-xl font-bold text-green-600">
                              ₹{item.flash_sale_price}
                            </Text>
                          </div>
                          <div>
                            <Text className="text-sm text-ui-fg-subtle">Discount</Text>
                            <Text className="text-lg font-semibold text-red-600">
                              {discount}% OFF
                            </Text>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="danger" 
                          onClick={() => handleDelete(item.id)}
                          size="small"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Container>
    )
  }
  
  export const config = defineRouteConfig({
    label: "Flash Sales",
  })
  
  export default FlashSalePage
