// AccountDropdown: Amazon-like multi-column dropdown for account section
"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
type AccountDropdownProps = {
  onLogout?: () => void;
};

// Placeholder data for "Buy It Again" - matches Amazon screenshot
const buyItAgainItems = [
  {
    id: "1",
    name: "T ESSENTIALS Digital LCD Finger Tally Counter, P...",
    price: 45.0,
    image: "/placeholder-product.jpg",
  },
  {
    id: "2",
    name: "Nutrabay Pure Micronised Creatine Monohydrate...",
    price: 249.0,
    unitPrice: "₹249.00/100 g",
    image: "/placeholder-product.jpg",
    isPrime: true,
  },
  {
    id: "3",
    name: "BEARDO Godfather Perfume For Men, 100...",
    price: 498.0,
    unitPrice: "₹4.98/millilitre",
    image: "/placeholder-product.jpg",
    isPrime: true,
  },
];

export default function AccountDropdown({ onLogout }: AccountDropdownProps) {

  const handleAddToCart = (itemId: string) => {
    // TODO: Implement add to cart functionality
    console.log("Add to cart:", itemId);
  };

  return (
    <div className="w-full max-w-[900px] bg-white shadow-2xl border border-gray-200 z-[9999]" style={{ backgroundColor: '#ffffff', opacity: 1 }}>
      {/* Top Section - Who is shopping? */}
      <div className="border-b border-gray-200 px-6 py-3 flex items-center justify-between bg-gray-50">
        <span className="text-sm text-gray-700">Who is shopping? Select a profile.</span>
        <button className="text-sm text-blue-600 hover:underline font-medium flex items-center gap-1">
          Manage Profiles
          <span className="text-xs">&gt;</span>
        </button>
      </div>

      <div className="flex">
        {/* Left Column - Buy It Again */}
        <div className="flex-1 p-6 border-r border-gray-200 min-w-[300px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Buy it again</h3>
            <Link href="/orders" className="text-sm text-blue-600 hover:underline">
              View All & Manage
            </Link>
          </div>
          <div className="space-y-4">
            {buyItAgainItems.map((item) => (
              <div key={item.id} className="flex gap-3 pb-4 border-b border-gray-100 last:border-0">
                <div className="w-20 h-20 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.name}
                    width={80}
                    height={80}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 line-clamp-2 mb-1">{item.name}</p>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base font-semibold text-gray-900">₹{item.price.toFixed(2)}</span>
                    {item.unitPrice && (
                      <span className="text-xs text-gray-500">({item.unitPrice})</span>
                    )}
                  </div>
                  {item.isPrime && (
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-xs text-green-600 font-semibold">✓</span>
                      <span className="text-xs text-green-600">prime</span>
                    </div>
                  )}
                  <Button
                    size="sm"
                    className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-xs h-7 px-3 rounded"
                    onClick={() => handleAddToCart(item.id)}
                  >
                    Add to cart
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Middle Column - Your Lists */}
        <div className="w-64 p-6 border-r border-gray-200">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Your Lists</h3>
          <div className="space-y-1">
            <Link href="/lists/alexa" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Alexa Shopping List
              <span className="text-gray-500 text-xs block font-normal">0 items</span>
            </Link>
            <Link href="/lists/shopping" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Shopping List
            </Link>
            <Link href="/lists/wishlist" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Create a Wish List
            </Link>
            <Link href="/lists/wish-from-any" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Wish from Any Website
            </Link>
            <Link href="/lists/baby" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Baby Wishlist
            </Link>
            <Link href="/lists/discover" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Discover Your Style
            </Link>
            <Link href="/lists/showroom" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Explore Showroom
            </Link>
          </div>
        </div>

        {/* Right Column - Your Account */}
        <div className="w-64 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Your Account</h3>
          <div className="space-y-1">
            <Link href="/account/switch" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Switch Accounts
            </Link>
            <button
              onClick={onLogout}
              className="block w-full text-left py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              Sign Out
            </button>
            <div className="border-t border-gray-200 my-2" />
            <Link href="/account" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Your Account
            </Link>
            <Link href="/orders" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Your Orders
            </Link>
            <Link href="/wishlist" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Your Wish List
            </Link>
            <Link href="/recommendations" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Keep shopping for
            </Link>
            <Link href="/recommendations" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Your Recommendations
            </Link>
            <Link href="/recalls" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Recalls and Product Safety Alerts
            </Link>
            <Link href="/prime" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Your Prime Membership
            </Link>
            <Link href="/prime-video" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Your Prime Video
            </Link>
            <Link href="/subscribe-save" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Your Subscribe & Save Items
            </Link>
            <Link href="/memberships" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Memberships & Subscriptions
            </Link>
            <Link href="/seller" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Your Seller Account
            </Link>
            <Link href="/content" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Content Library
            </Link>
            <Link href="/devices" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Devices
            </Link>
            <Link href="/business" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Register for a free Business Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

