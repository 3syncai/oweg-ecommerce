"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import { ACCOUNT_NAV, isAccountNavActive } from "@/components/account/account-nav";
import LogoutConfirmModal from "@/components/account/LogoutConfirmModal";
import { cn } from "@/lib/utils";

const navLinkBase =
  "flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#1F2A33] transition-colors hover:bg-[#EAF8E7] hover:text-[#66C940]";

const navLinkActive =
  "bg-[#EAF8E7] border-l-4 border-[#66C940] text-[#66C940] hover:bg-[#EAF8E7] hover:text-[#66C940]";

const mobileNavLinkBase =
  "inline-flex shrink-0 items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-[#1F2A33] transition-colors hover:border-[#66C940] hover:text-[#66C940]";

const mobileNavLinkActive =
  "border-[#66C940] bg-[#EAF8E7] text-[#66C940] hover:bg-[#EAF8E7] hover:text-[#66C940]";

function NavLink({
  href,
  label,
  icon,
  active,
  variant,
}: {
  href: string;
  label: string;
  icon: (typeof ACCOUNT_NAV)[number]["icon"];
  active: boolean;
  variant: "desktop" | "mobile";
}) {
  if (variant === "mobile") {
    return (
      <Link
        href={href}
        className={cn(mobileNavLinkBase, active && mobileNavLinkActive)}
        aria-current={active ? "page" : undefined}
      >
        <AccountHubIcon name={icon} size={18} className="h-[18px] w-[18px]" />
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(navLinkBase, active && navLinkActive)}
      aria-current={active ? "page" : undefined}
    >
      <AccountHubIcon name={icon} size={20} className="h-5 w-5 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

function MobileAccountNav() {
  const pathname = usePathname();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollHints = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollHints();
    el.addEventListener("scroll", updateScrollHints, { passive: true });
    const ro = new ResizeObserver(updateScrollHints);
    ro.observe(el);

    const active = el.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
    requestAnimationFrame(updateScrollHints);

    return () => {
      el.removeEventListener("scroll", updateScrollHints);
      ro.disconnect();
    };
  }, [pathname, updateScrollHints]);

  const scrollByDir = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 180, behavior: "smooth" });
  };

  return (
    <>
      <div className="relative md:hidden -mx-4">
        {canScrollLeft ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-10 bg-gradient-to-r from-white via-white to-transparent"
            />
            <button
              type="button"
              aria-label="Scroll account tabs left"
              onClick={() => scrollByDir(-1)}
              className="absolute left-1 top-1/2 z-[2] inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--oweg-border)] bg-white text-[var(--oweg-green-dark,#326b00)] shadow-sm transition active:scale-95"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </>
        ) : null}

        <nav
          ref={scrollRef}
          className="overflow-x-auto scrollbar-hide px-4"
          aria-label="Account navigation"
        >
          <div className="flex w-max min-w-full gap-2 pb-1">
            {ACCOUNT_NAV.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isAccountNavActive(pathname, item.href)}
                variant="mobile"
              />
            ))}
            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              className={cn(
                mobileNavLinkBase,
                "border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              )}
            >
              <AccountHubIcon name="logout" size={18} className="h-[18px] w-[18px]" />
              <span>Sign Out</span>
            </button>
          </div>
        </nav>

        {canScrollRight ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-10 bg-gradient-to-l from-white via-white to-transparent"
            />
            <button
              type="button"
              aria-label="Scroll account tabs right"
              onClick={() => scrollByDir(1)}
              className="absolute right-1 top-1/2 z-[2] inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--oweg-border)] bg-white text-[var(--oweg-green-dark,#326b00)] shadow-sm transition active:scale-95"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </>
        ) : null}
      </div>

      <LogoutConfirmModal open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </>
  );
}

export default function AccountSidebar() {
  const pathname = usePathname();
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <>
      <MobileAccountNav />

      {/* Desktop: vertical sidebar */}
      <aside className="hidden md:sticky md:top-[calc(var(--app-header-height,136px)+1rem)] md:flex md:flex-col md:self-start md:overflow-hidden md:rounded-[var(--oweg-radius-md)] md:border md:border-[var(--oweg-border)] md:bg-[var(--oweg-surface)] md:shadow-[var(--oweg-shadow-sm)]">
        <nav className="flex flex-col py-2" aria-label="Account navigation">
          {ACCOUNT_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isAccountNavActive(pathname, item.href)}
              variant="desktop"
            />
          ))}
        </nav>

        <div className="border-t border-gray-100 p-2">
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            className={cn(
              navLinkBase,
              "w-full rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700"
            )}
          >
            <AccountHubIcon name="logout" size={20} className="h-5 w-5 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <LogoutConfirmModal open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </>
  );
}
