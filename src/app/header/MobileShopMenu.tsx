"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BadgePercent, ChevronRight, CircleHelp, Menu, PackageCheck, Sparkles, Tag, X } from "lucide-react";
import styles from "./HeaderNavigation.module.css";
import { defaultMobileMenu, parseMobileMenu } from "../../../my-medusa-store/src/shared/mobile-shop-menu";

const icons: Record<string, typeof Tag> = {
  "/brands": Tag, "/flash-sale": BadgePercent, "/specials": Sparkles,
  "/account/orders": PackageCheck, "/account/help": CircleHelp,
};

export default function MobileShopMenu() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState(defaultMobileMenu);
  const refreshing = useRef(false);
  const refreshAfter = useRef(0);

  async function refreshMenu() {
    if (refreshing.current || Date.now() < refreshAfter.current) return;
    refreshing.current = true;
    try {
      const response = await fetch("/api/medusa/mobile-shop-menu", { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const menu = parseMobileMenu((await response.json()).items);
      if (menu) {
        setItems(menu);
        refreshAfter.current = Date.now() + 60_000;
      }
    } catch {
      // Keep the last loaded menu when the connection fails.
    } finally {
      refreshing.current = false;
    }
  }

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    let warmup: number | undefined;
    const syncViewport = () => {
      window.clearTimeout(warmup);
      if (desktop.matches) dialog.current?.close();
      else warmup = window.setTimeout(() => void refreshMenu(), 250);
    };
    syncViewport();
    desktop.addEventListener("change", syncViewport);
    return () => {
      window.clearTimeout(warmup);
      desktop.removeEventListener("change", syncViewport);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="Open shopping menu"
        aria-haspopup="dialog"
        className={styles.mobileHeaderAction}
        onClick={() => {
          if (!dialog.current?.open) dialog.current?.showModal();
          void refreshMenu();
        }}
      >
        <Menu size={22} aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        aria-label="Shopping menu"
        className={styles.mobileShopDrawer}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className={styles.mobileShopPanel}>
          <div className={styles.mobileShopHeading}>
            <Link href="/" prefetch={false} aria-label="OWEG home" onClick={() => dialog.current?.close()}>
              <Image src="/oweg_logo.png" alt="OWEG" width={100} height={28} className="h-7 w-auto" />
            </Link>
            <button type="button" className={styles.mobileHeaderAction} aria-label="Close shopping menu"
              autoFocus onClick={() => dialog.current?.close()}>
              <X size={22} aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Shop and support">
            {(["Shop", "Support"] as const).map(label => {
              const links = items.filter(item => item.visible && item.section === label);
              return links.length > 0 && (
                <section key={label} className={styles.mobileShopGroup} aria-label={label}>
                  <h2>{label}</h2>
                  {links.map(({ label, href }) => {
                    const Icon = icons[href] ?? Tag;
                    return (
                      <Link key={href} href={href} prefetch={false} onClick={() => dialog.current?.close()}>
                        <span className={styles.mobileShopIcon}><Icon size={20} aria-hidden="true" /></span>
                        <span>{label}</span>
                        <ChevronRight size={17} aria-hidden="true" />
                      </Link>
                    );
                  })}
                </section>
              );
            })}
          </nav>
        </div>
      </dialog>
    </>
  );
}
