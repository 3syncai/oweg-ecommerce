"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { buildLoginUrl, buildSignupUrl } from "@/lib/auth-redirect";
import { MyWishlistMenuIcon } from "@/components/ui/icons/account";

const itemClassName =
  "flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium text-[#1F2A33] transition-colors hover:bg-[#EAF8E7] hover:text-[#66C940]";

export default function GuestAccountDropdown() {
  const pathname = usePathname();
  const loginHref = buildLoginUrl(pathname);
  const signupHref = buildSignupUrl(pathname);

  return (
    <div className="w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl">
      <div className="border-b border-gray-200 p-4">
        <p className="mb-1 text-sm font-semibold text-[#1F2A33]">Welcome</p>
        <p className="text-xs text-gray-600">Sign in to access your account</p>
      </div>

      <div className="space-y-1 p-2">
        <Link href={loginHref} className={itemClassName}>
          <LogIn className="h-5 w-5 shrink-0" />
          <span>Sign in</span>
        </Link>
        <Link href={signupHref} className={itemClassName}>
          <UserPlus className="h-5 w-5 shrink-0" />
          <span>New customer? Start here</span>
        </Link>
      </div>

      <div className="border-t border-gray-200 p-2">
        <Link href="/wishlist" className={itemClassName}>
          <MyWishlistMenuIcon className="shrink-0" />
          <span>Your Wish List</span>
        </Link>
      </div>

      <div className="space-y-1 border-t border-gray-200 p-2">
        <Link href="/account" className={itemClassName}>
          <span>Your Account</span>
        </Link>
        <Link href="/orders" className={itemClassName}>
          <span>Your Orders</span>
        </Link>
      </div>
    </div>
  );
}
