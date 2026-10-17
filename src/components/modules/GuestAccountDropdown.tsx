"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronRight, LogIn, Package, UserPlus, UserRound } from "lucide-react";
import { buildLoginUrl, buildSignupUrl } from "@/lib/auth-redirect";
import { MyWishlistMenuIcon } from "@/components/ui/icons/account";
import styles from "./AccountDropdown.module.css";

export default function GuestAccountDropdown() {
  const pathname = usePathname();
  const loginHref = buildLoginUrl(pathname);
  const signupHref = buildSignupUrl(pathname);

  return (
    <div className={styles.menu}>
      <div className={styles.header}>
        <span className={styles.avatar}><UserRound size={21} aria-hidden="true" /></span>
        <div>
          <p className={styles.eyebrow}>Your space at OWEG</p>
          <p className={styles.title}>Welcome, good to see you.</p>
          <p className={styles.description}>Sign in to access your account.</p>
        </div>
      </div>

      <div className={styles.auth}>
        <Link href={loginHref} className={styles.signin}>
          <LogIn size={17} aria-hidden="true" />
          <span>Sign in</span>
          <ArrowRight size={16} className={styles.arrow} style={{ color: "inherit" }} aria-hidden="true" />
        </Link>
        <Link href={signupHref} className={styles.signup}>
          <UserPlus size={15} aria-hidden="true" />
          <span>New customer? Start here</span>
        </Link>
      </div>

      <hr className={styles.divider} />
      <div className={styles.shortcuts}>
        <p className={styles.sectionLabel}>Your shortcuts</p>
        <Link href="/wishlist" className={styles.row}>
          <span className={styles.icon}><MyWishlistMenuIcon className="shrink-0" /></span>
          <span>Your Wish List</span>
          <ChevronRight size={14} className={styles.arrow} aria-hidden="true" />
        </Link>
        <Link href="/account" className={styles.row}>
          <span className={styles.icon}><UserRound size={17} aria-hidden="true" /></span>
          <span>Your Account</span>
          <ChevronRight size={14} className={styles.arrow} aria-hidden="true" />
        </Link>
        <Link href="/orders" className={styles.row}>
          <span className={styles.icon}><Package size={17} aria-hidden="true" /></span>
          <span>Your Orders</span>
          <ChevronRight size={14} className={styles.arrow} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
