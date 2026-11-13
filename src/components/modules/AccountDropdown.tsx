"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, LogOut, UserRound } from "lucide-react";
import styles from "./AccountDropdown.module.css";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import {
  MyAccountMenuIcon,
  MyWishlistMenuIcon,
} from "@/components/ui/icons/account";

type AccountDropdownProps = {
  customerName: string;
  onSignOutClick?: () => void;
};

export default function AccountDropdown({ customerName, onSignOutClick }: AccountDropdownProps) {
  return (
    <div className={styles.menu}>
      <div className={styles.header}>
        <span className={styles.avatar}><UserRound size={21} aria-hidden="true" /></span>
        <div className={styles.identity}>
          <p className={styles.eyebrow}>Signed in as</p>
          <p className={styles.title}>{customerName}</p>
        </div>
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
          <span className={styles.icon}><LogOut size={17} aria-hidden="true" /></span>
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
