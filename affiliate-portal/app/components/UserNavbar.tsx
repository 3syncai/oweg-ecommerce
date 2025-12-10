"use client"

import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { LayoutDashboard, LogOut, Package } from "lucide-react"

interface UserNavbarProps {
    userName?: string
}

export default function UserNavbar({ userName }: UserNavbarProps) {
    const router = useRouter()
    const pathname = usePathname()

    const handleLogout = () => {
        localStorage.removeItem("affiliate_token")
        localStorage.removeItem("affiliate_user")
        localStorage.removeItem("affiliate_role")
        router.push("/login")
    }

    const isActive = (path: string) => pathname === path

    return (
        <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    {/* Left side - Logo and navigation */}
                    <div className="flex items-center space-x-8">
                        <Link href="/dashboard" className="flex items-center space-x-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                                <span className="text-white font-bold text-sm">AF</span>
                            </div>
                            <span className="text-xl font-bold text-gray-900">Affiliate Portal</span>
                        </Link>

                        {/* Navigation Links */}
                        <div className="hidden md:flex items-center space-x-1">
                            <Link
                                href="/dashboard"
                                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${isActive("/dashboard")
                                        ? "bg-green-50 text-green-700"
                                        : "text-gray-600 hover:bg-green-50 hover:text-green-700"
                                    }`}
                            >
                                <LayoutDashboard size={18} />
                                <span>Dashboard</span>
                            </Link>
                            <Link
                                href="/products"
                                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${isActive("/products")
                                        ? "bg-green-50 text-green-700"
                                        : "text-gray-600 hover:bg-green-50 hover:text-green-700"
                                    }`}
                            >
                                <Package size={18} />
                                <span>Products</span>
                            </Link>
                        </div>
                    </div>

                    {/* Right side - User info and logout */}
                    <div className="flex items-center space-x-4">
                        {userName && (
                            <span className="text-gray-600 text-sm hidden sm:block">
                                Welcome, <span className="font-semibold text-gray-900">{userName}</span>
                            </span>
                        )}
                        <button
                            onClick={handleLogout}
                            className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                            <LogOut size={18} />
                            <span className="hidden sm:inline">Logout</span>
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    )
}
