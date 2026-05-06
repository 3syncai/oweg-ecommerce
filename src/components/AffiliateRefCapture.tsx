"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const STORAGE_KEY = "oweg_affiliate_ref";
const COOKIE_NAME = "oweg_affiliate_ref";
const COOKIE_TTL_DAYS = 30;

function setCookie(name: string, value: string, days: number) {
    if (typeof document === "undefined") return;
    const maxAge = days * 24 * 60 * 60;
    const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; path=/; SameSite=Lax${isHttps ? "; Secure" : ""}`;
}

/**
 * Captures `?ref=CODE` from the current URL on every navigation and persists
 * it to localStorage + a 30-day cookie so the checkout page can pre-fill the
 * affiliate code field automatically.
 *
 * Mounted once at the root layout level — does not modify any page UI.
 */
export default function AffiliateRefCapture() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (typeof window === "undefined") return;
        const ref = searchParams?.get("ref");
        if (!ref) return;

        const trimmed = ref.trim().toUpperCase();
        if (!trimmed || trimmed.length > 32) return;

        try {
            window.localStorage.setItem(STORAGE_KEY, trimmed);
        } catch {
            /* ignore — private mode etc. */
        }
        setCookie(COOKIE_NAME, trimmed, COOKIE_TTL_DAYS);
    }, [pathname, searchParams]);

    return null;
}
