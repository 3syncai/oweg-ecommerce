"use client";

import React from "react";
import Link from "next/link";
import {
  MyAccountMenuIcon,
  MyWishlistMenuIcon,
  SignOutMenuIcon,
} from "@/components/ui/icons/account";

type AccountDropdownProps = {
  onLogout?: () => void;
};

const itemClassName =
  "flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium text-[#1F2A33] transition-colors hover:bg-[#EAF8E7] hover:text-[#66C940]";

export default function AccountDropdown({ onLogout }: AccountDropdownProps) {
  return (
    <div className="w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl">
      <div className="space-y-1 p-2">
        <Link href="/account" className={itemClassName}>
          <MyAccountMenuIcon className="shrink-0" />
          <span>My Account</span>
        </Link>
        <Link href="/wishlist" className={itemClassName}>
          <MyWishlistMenuIcon className="shrink-0" />
          <span>My Wishlist</span>
        </Link>
        <button type="button" onClick={onLogout} className={itemClassName}>
          <SignOutMenuIcon className="shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
