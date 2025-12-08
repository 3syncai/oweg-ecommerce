"use client"

import { useEffect, useState } from "react"
import { Search, Filter, Package, DollarSign, TrendingUp, CheckCircle, XCircle } from "lucide-react"

type Product = {
  id: string
  title: string
  handle: string
  status: string
  description?: string
  thumbnail?: string
  images: any[]
  categories: Array<{ id: string; name: string; handle: string; commission: number }>
  collection: { id: string; title: string; handle: string; commission: number } | null
  tags: Array<{ id: string; value: string }>
  type: { id: string; value: string } | null
  variants: Array<{
    id: string
    title: string
    sku?: string
    inventory_quantity: number
    price: number
  }>
  total_inventory: number
  in_stock: boolean
  commission: number
  created_at: string
  updated_at: string
}

type Filters = {
  categories: Array<{ id: string; name: string; handle: string; commission: number }>
  collections: Array<{ id: string; title: string; handle: string; commission: number }>
  types: Array<{ id: string; value: string }>
}

export default function ProductCommissionPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [filters, setFilters] = useState<Filters>({ categories: [], collections: [], types: [] })
  const [stats, setStats] = useState({ total: 0, in_stock: 0, out_of_stock: 0 })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedCollection, setSelectedCollection] = useState<string>("all")
  const [selectedType, setSelectedType] = useState<string>("all")
  const [stockFilter, setStockFilter] = useState<string>("all")
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [])

  useEffect(() => {
    filterProducts()
  }, [products, searchTerm, selectedCategory, selectedCollection, selectedType, stockFilter])

  const loadProducts = async () => {
    setLoading(true)
    try {
      const { apiRequest } = await import("../../../lib/api-client")
      const response = await apiRequest("/affiliate/admin/products")

      if (response.ok) {
        const data = await response.json()
        setProducts(data.products || [])
        setFilters(data.filters || { categories: [], collections: [], types: [] })
        setStats(data.stats || { total: 0, in_stock: 0, out_of_stock: 0 })
      } else {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }))
        console.error("Failed to fetch products:", response.status, errorData)
        alert(`Failed to load products: ${errorData.message || "Unknown error"}`)
      }
    } catch (error) {
      console.error("Failed to fetch products:", error)
      alert(`Error loading products: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setLoading(false)
    }
  }

  const filterProducts = () => {
    let filtered = [...products]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(term) ||
          p.handle.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term) ||
          p.variants.some((v) => v.sku?.toLowerCase().includes(term))
      )
    }

    // Category filter
    if (selectedCategory !== "all") {
      filtered = filtered.filter((p) => p.categories.some((c) => c.id === selectedCategory))
    }

    // Collection filter
    if (selectedCollection !== "all") {
      filtered = filtered.filter((p) => p.collection?.id === selectedCollection)
    }

    // Type filter
    if (selectedType !== "all") {
      filtered = filtered.filter((p) => p.type?.id === selectedType)
    }

    // Stock filter
    if (stockFilter === "in_stock") {
      filtered = filtered.filter((p) => p.in_stock)
    } else if (stockFilter === "out_of_stock") {
      filtered = filtered.filter((p) => !p.in_stock)
    }

    setFilteredProducts(filtered)
  }

  const formatCurrency = (amount: number) => {
    // Backend returns price directly, no division needed
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-500">Loading products...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Product Commission</h1>
        <p className="text-gray-600 mt-1">Manage commission settings for products, categories, and collections</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Products</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">In Stock</p>
              <p className="text-2xl font-bold text-green-600 mt-2">{stats.in_stock}</p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Out of Stock</p>
              <p className="text-2xl font-bold text-red-600 mt-2">{stats.out_of_stock}</p>
            </div>
            <div className="bg-red-100 p-3 rounded-lg">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Filtered Results</p>
              <p className="text-2xl font-bold text-indigo-600 mt-2">{filteredProducts.length}</p>
            </div>
            <div className="bg-indigo-100 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative z-10">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative z-10">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 z-10" />
            <input
              type="text"
              placeholder="Search products by name, SKU, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white relative z-10"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 relative z-20 bg-white"
          >
            <Filter className="w-5 h-5 mr-2" />
            Filters
          </button>
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200 relative z-10 bg-white">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 appearance-none cursor-pointer"
              >
                <option value="all">All Categories</option>
                {filters.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Collection</label>
              <select
                value={selectedCollection}
                onChange={(e) => setSelectedCollection(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 appearance-none cursor-pointer"
              >
                <option value="all">All Collections</option>
                {filters.collections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 appearance-none cursor-pointer"
              >
                <option value="all">All Types</option>
                {filters.types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.value}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Stock Status</label>
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 appearance-none cursor-pointer"
              >
                <option value="all">All Products</option>
                <option value="in_stock">In Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Collection
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Inventory
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Commission
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No products found
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {product.thumbnail && (
                          <img
                            src={product.thumbnail}
                            alt={product.title}
                            className="w-12 h-12 rounded-lg object-cover mr-3"
                          />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">{product.title}</div>
                          <div className="text-xs text-gray-500">SKU: {product.variants[0]?.sku || "N/A"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {product.categories.length > 0 ? (
                          <div className="space-y-1">
                            {product.categories.map((cat) => (
                              <div key={cat.id} className="flex items-center">
                                <span>{cat.name}</span>
                                {cat.commission > 0 && (
                                  <span className="ml-2 text-xs text-green-600">
                                    ({cat.commission}%)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">No category</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {product.collection ? (
                          <div>
                            <div>{product.collection.title}</div>
                            {product.collection.commission > 0 && (
                              <div className="text-xs text-green-600">
                                Commission: {product.collection.commission}%
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">No collection</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className={`font-medium ${product.in_stock ? "text-green-600" : "text-red-600"}`}>
                          {product.total_inventory} units
                        </div>
                        <div className="text-xs text-gray-500">
                          {product.variants.length} variant{product.variants.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="font-medium text-indigo-600">
                          {product.commission > 0 ? `${product.commission}%` : "Not set"}
                        </div>
                        {product.variants[0]?.price && (
                          <div className="text-xs text-gray-500">
                            Price: {formatCurrency(product.variants[0].price)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          product.in_stock
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {product.in_stock ? "In Stock" : "Out of Stock"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

