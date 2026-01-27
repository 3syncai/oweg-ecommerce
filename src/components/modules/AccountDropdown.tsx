// AccountDropdown: Simplified dropdown showing only implemented features
"use client";

import React from "react";
import Link from "next/link";
type AccountDropdownProps = {
  onLogout?: () => void;
};

export default function AccountDropdown({ onLogout }: AccountDropdownProps) {
  return (
    <div className="w-full max-w-[400px] bg-white shadow-2xl border border-gray-200 z-[9999]" style={{ backgroundColor: '#ffffff', opacity: 1 }}>
      <div className="px-4 py-3">
        <div className="space-y-2">
          <Link href="/account" className="block text-base font-medium text-blue-600 hover:text-blue-800 hover:underline">
            My Account
          </Link>
          <Link href="/wishlist" className="block text-base font-medium text-blue-600 hover:text-blue-800 hover:underline">
            My Wishlist
          </Link>
          <button
            onClick={onLogout}
            className="block w-full text-left text-base font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

