// GuestAccountDropdown: Dropdown menu for non-logged-in users (Amazon-style)
"use client";

import React from "react";
import Link from "next/link";
import { Heart, GitCompare, LogIn, UserPlus } from "lucide-react";

export default function GuestAccountDropdown() {
  return (
    <div className="w-64 bg-white shadow-2xl border border-gray-200 z-[9999] rounded-lg overflow-hidden" style={{ backgroundColor: '#ffffff', opacity: 1 }}>
      <div className="p-4 border-b border-gray-200">
        <p className="text-sm font-semibold text-gray-900 mb-1">Welcome</p>
        <p className="text-xs text-gray-600">Sign in to access your account</p>
      </div>
      
      <div className="p-2">
        <Link
          href="/login"
          className="flex items-center gap-3 px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <LogIn className="w-4 h-4" />
          <span>Sign in</span>
        </Link>
        <Link
          href="/signup"
          className="flex items-center gap-3 px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span>New customer? Start here</span>
        </Link>
      </div>

      <div className="border-t border-gray-200 p-2">
        <Link
          href="/wishlist"
          className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded transition-colors"
        >
          <Heart className="w-4 h-4" />
          <span>Your Wish List</span>
        </Link>
        <Link
          href="/compare"
          className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded transition-colors"
        >
          <GitCompare className="w-4 h-4" />
          <span>Compare Products</span>
        </Link>
      </div>

      <div className="border-t border-gray-200 p-2">
        <Link
          href="/account"
          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded transition-colors"
        >
          Your Account
        </Link>
        <Link
          href="/orders"
          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded transition-colors"
        >
          Your Orders
        </Link>
        <Link
          href="/recommendations"
          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded transition-colors"
        >
          Recommendations
        </Link>
        <Link
          href="/browsing-history"
          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded transition-colors"
        >
          Browsing History
        </Link>
      </div>
    </div>
  );
}
