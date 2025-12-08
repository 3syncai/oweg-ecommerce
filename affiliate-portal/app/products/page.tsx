"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Package, IndianRupee, Percent, Box } from "lucide-react"
import UserNavbar from "../components/UserNavbar"

interface Product {
    id: string
    title: string
    description: string
    thumbnail: string | null
    price: number
    category: string
    categories: string[]
    collection: string | null
    isInStock: boolean
    inventoryQuantity: number
    commissionRate: number | null
    commissionSource: string | null
    commissionAmount: number
    hasCommission: boolean
}

export default function ProductsPage() {
    const router = useRouter()
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [products, setProducts] = useState<Product[]>([])
    const [allProducts, setAllProducts] = useState<Product[]>([])
    const [categories, setCategories] = useState<string[]>([])
    const [selectedCategory, setSelectedCategory] = useState<string>("all")
    const [searchQuery, setSearchQuery] = useState("")
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        // Check if user is logged in
        const token = localStorage.getItem("affiliate_token")
        const userData = localStorage.getItem("affiliate_user")
        const role = localStorage.getItem("affiliate_role")

        if (!token || !userData) {
            router.push("/login")
            return
        }

        // If admin, redirect to admin dashboard
        if (role === "admin") {
            router.push("/admin/dashboard")
            return
        }

        try {
            const parsedUser = JSON.parse(userData)

            if (!parsedUser.is_approved) {
                router.push("/verification-pending")
                return
            }

            setUser(parsedUser)
            fetchProducts(token)
        } catch (e) {
            console.error("Error parsing user data:", e)
            router.push("/login")
        }
    }, [router])

    const fetchProducts = async (token: string) => {
        try {
            const response = await fetch("http://localhost:9000/affiliate/user/products", {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            })

            if (!response.ok) {
                throw new Error("Failed to fetch products")
            }

            const data = await response.json()
            setProducts(data.products || [])
            setAllProducts(data.allProducts || [])
            setCategories(data.categories || [])
        } catch (err: any) {
            console.error("Error fetching products:", err)
            setError(err.message || "Failed to load products")
        } finally {
            setLoading(false)
        }
    }

    // Filter products by search and category
    const filteredProducts = products.filter(product => {
        const matchesSearch = product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            product.description.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesCategory = selectedCategory === "all" || product.category === selectedCategory
        return matchesSearch && matchesCategory
    })

    const userName = user?.first_name && user?.last_name
        ? `${user.first_name} ${user.last_name}`
        : user?.email

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center space-y-4">
                    <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-600">Loading products...</span>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <UserNavbar userName={userName} />

            <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Product Catalog</h1>
                        <p className="text-gray-600 mt-1">Browse products and see your commission rates</p>
                    </div>
                    <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium">
                        {filteredProducts.length} Products Available
                    </div>
                </div>

                {/* Search and Filters */}
                <div className="flex flex-col lg:flex-row gap-4 mb-8">
                    {/* Search Bar */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all bg-white"
                        />
                    </div>

                    {/* Category Filters */}
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setSelectedCategory("all")}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedCategory === "all"
                                    ? "bg-green-600 text-white"
                                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                                }`}
                        >
                            All Categories
                        </button>
                        {categories.map((category) => (
                            <button
                                key={category}
                                onClick={() => setSelectedCategory(category)}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedCategory === category
                                        ? "bg-green-600 text-white"
                                        : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                                    }`}
                            >
                                {category}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Error State */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-8">
                        {error}
                    </div>
                )}

                {/* Products Grid */}
                {filteredProducts.length === 0 ? (
                    <div className="text-center py-16">
                        <Package className="mx-auto text-gray-400 mb-4" size={48} />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
                        <p className="text-gray-600">
                            {searchQuery || selectedCategory !== "all"
                                ? "Try adjusting your search or filter criteria"
                                : "Products with commission will appear here once admin sets them up"}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProducts.map((product) => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    )
}

function ProductCard({ product }: { product: Product }) {
    return (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
            {/* Image Placeholder */}
            <div className="h-48 bg-gray-100 flex items-center justify-center">
                {product.thumbnail ? (
                    <img
                        src={product.thumbnail}
                        alt={product.title}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <Box className="text-gray-300" size={64} />
                )}
            </div>

            {/* Content */}
            <div className="p-5">
                {/* Title and Stock Badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900 text-lg leading-tight line-clamp-2">
                        {product.title}
                    </h3>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${product.isInStock
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                        {product.isInStock ? "In Stock" : "Out of Stock"}
                    </span>
                </div>

                {/* Description */}
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                    {product.description || "No description available"}
                </p>

                {/* Rating and Category */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1">
                        <span className="text-yellow-500">★</span>
                        <span className="text-sm text-gray-600">4.5</span>
                    </div>
                    <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {product.category}
                    </span>
                </div>

                {/* Price and Commission */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1">
                        <IndianRupee size={16} className="text-gray-700" />
                        <span className="text-xl font-bold text-gray-900">
                            {product.price.toLocaleString("en-IN")}
                        </span>
                    </div>
                    {product.commissionRate && (
                        <div className="flex items-center gap-1 text-green-600">
                            <Percent size={14} />
                            <span className="text-sm font-medium">{product.commissionRate}% commission</span>
                        </div>
                    )}
                </div>

                {/* Inventory */}
                {product.inventoryQuantity > 0 && (
                    <div className="flex items-center gap-1 text-gray-500 text-sm mb-3">
                        <Box size={14} />
                        <span>{product.inventoryQuantity} units available</span>
                    </div>
                )}

                {/* Your Commission */}
                {product.commissionRate && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                        <span className="text-emerald-700 font-medium">
                            Your commission: ₹{product.commissionAmount.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}
