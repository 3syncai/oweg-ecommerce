"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, UserRound } from "lucide-react";
import styles from "./AccountDropdown.module.css";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import {
  MyAccountMenuIcon,
  MyWishlistMenuIcon,
  SignOutMenuIcon,
} from "@/components/ui/icons/account";

type AccountDropdownProps = {
  onSignOutClick?: () => void;
};

export default function AccountDropdown({ onSignOutClick }: AccountDropdownProps) {
  return (
    <div className={styles.menu}>
      <div className={styles.header}>
        <span className={styles.avatar}><UserRound size={21} aria-hidden="true" /></span>
        <div><p className={styles.eyebrow}>Your space at OWEG</p><p className={styles.title}>Make yourself at home.</p><p className={styles.description}>Your orders, favourites and account.</p></div>
      </div>
      <div className={styles.shortcuts}>
        <Link href="/account" className={styles.row}>
          <span className={styles.icon}><MyAccountMenuIcon className="shrink-0" /></span>
          <span>My Account</span>
          <ChevronRight size={14} className={styles.arrow} aria-hidden="true" />
        </Link>
        <Link href="/account/orders" className={styles.row}>
          <span className={styles.icon}><AccountHubIcon name="orders" size={20} className="h-5 w-5 shrink-0" /></span>
          <span>Orders</span>
          <ChevronRight size={14} className={styles.arrow} aria-hidden="true" />
        </Link>
        <Link href="/account/wishlist" className={styles.row}>
          <span className={styles.icon}><MyWishlistMenuIcon className="shrink-0" /></span>
          <span>Wishlist</span>
          <ChevronRight size={14} className={styles.arrow} aria-hidden="true" />
        </Link>
      </div>
      <div className={styles.signout}>
        <button type="button" onClick={() => onSignOutClick?.()} className={styles.row}>
          <span className={styles.icon}><SignOutMenuIcon className="shrink-0" /></span>
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
