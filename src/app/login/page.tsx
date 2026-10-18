"use client";

import BrandLoader from "@/components/ui/BrandLoader";
import React, { Suspense, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Heart, PackageCheck, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthProvider";
import { getSafeRedirect } from "@/lib/auth-redirect";
import CustomerLoginFlow from "@/components/auth/CustomerLoginFlow";
import styles from "./signin.module.css";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { customer, initializing } = useAuth();
  const redirectTarget = getSafeRedirect(searchParams.get("redirect"));

  useEffect(() => {
    if (initializing) return;
    if (customer) {
      router.replace(redirectTarget);
    }
  }, [customer, initializing, router, redirectTarget]);

  useEffect(() => {
    if (searchParams.get("reset") !== "success") return;
    toast.success("Password reset successfully. Please log in.");
    router.replace("/login");
  }, [router, searchParams]);

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <Link href="/" className={styles.backLink}><ArrowLeft size={16} aria-hidden="true" /> Back to shopping</Link>
        <div className={styles.card}>
          <aside className={styles.story} aria-label="Your OWEG account">
            <div className={styles.eyebrow}><span /> A little more everyday</div>
            <h2>Your favourites.{" "}<br />Your rewards.{" "}<br /><span>Your <span className={styles.brandWord} role="img" aria-label="OWEG"><span className={styles.brandO} aria-hidden="true" /><span aria-hidden="true">WEG</span></span>.</span></h2>
            <p className={styles.intro}>Pick up where you left off. Good finds, saved favourites and your next delivery are all right here.</p>
            <div className={styles.illustration} aria-hidden="true">
              <div className={styles.orbit} />
              <svg viewBox="0 0 340 280" fill="none" className={styles.bag}>
                <ellipse cx="174" cy="251" rx="111" ry="12" fill="#214B28" opacity=".08" />
                <path d="M99 90 247 78 267 234 84 247Z" fill="#6BB836" stroke="#386B25" strokeWidth="1.5" />
                <path d="m247 78 28 23 16 126-24 7Z" fill="#4D922C" stroke="#386B25" strokeWidth="1.5" />
                <path d="m99 90 30-16 146 27-28-23Z" fill="#A6D879" />
                <path d="M139 114V69c0-43 65-43 65 0v39" stroke="#214B28" strokeWidth="9" strokeLinecap="round" />
                <path d="M142 113V69c0-38 59-38 59 0v39" stroke="#D3ECAC" strokeWidth="3" strokeLinecap="round" />
                <g transform="rotate(-5 113 184)">
                  <rect x="106" y="143" width="139" height="49" rx="7" fill="#FFFFFF" />
                  <image href="/oweg_logo.png" x="114" y="151" width="123" height="33" preserveAspectRatio="xMidYMid meet" />
                </g>
                <path d="m126 202 93-8" stroke="#CDE5AF" strokeWidth="1.5" />
              </svg>
              <div className={styles.savedTag}><span><Heart size={17} /></span><div>Made for your wishlist<small>Keep the things you love close.</small></div></div>
              <div className={styles.deliveryTag}><PackageCheck size={20} /><span>Your next good find awaits</span></div>
              <Sparkles className={styles.sparkle} size={25} />
            </div>
            <div className={styles.benefits}>
              <span><PackageCheck size={17} /> Track your orders</span>
              <span><Heart size={17} /> Save your favourites</span>
            </div>
          </aside>
          <div className={styles.formPanel}>
            <div className={styles.formTop}><span>YOUR OWEG ACCOUNT</span><span className={styles.brandDot} aria-hidden="true" /></div>
            <CustomerLoginFlow
              variant="page"
              className={styles.loginForm}
              signupRedirectPath={
                redirectTarget && redirectTarget !== "/" ? redirectTarget : undefined
              }
              onSuccess={() => {
                router.push(redirectTarget);
              }}
            />
            <div className={styles.help}>A little help getting started?<Link href="/contact">Get in touch <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<BrandLoader label="Getting your sign-in ready…" />}>
      <LoginPageInner />
    </Suspense>
  );
}
