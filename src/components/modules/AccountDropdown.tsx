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
      {/* Right Column - Your Account */}
      <div className="p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Your Account</h3>
        <div className="space-y-1">
          <button
            onClick={onLogout}
            className="block w-full text-left py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            Sign Out
          </button>
          <div className="border-t border-gray-200 my-2" />
          <Link href="/wishlist" className="block py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
            Your Wish List
          </Link>
        </div>
      </div>
    </div>
  );
}

