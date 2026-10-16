"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import { ACCOUNT_NAV, isAccountNavActive } from "@/components/account/account-nav";
import LogoutConfirmModal from "@/components/account/LogoutConfirmModal";
import { useAuth } from "@/contexts/AuthProvider";
import { getCustomerDisplayName } from "@/lib/account-utils";
import { cn } from "@/lib/utils";

const navLinkBase =
  "flex min-h-9 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#326b29] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600";

const navLinkActive =
  "bg-green-50 font-semibold text-[#326b29] hover:bg-green-50 hover:text-[#326b29]";

const mobileNavLinkBase =
  "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-green-200 hover:text-[#326b29] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600";

const mobileNavLinkActive =
  "border-green-200 bg-green-50 font-semibold text-[#326b29] hover:bg-green-50 hover:text-[#326b29]";

const mobileGridLinkBase =
  "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1.5 bg-white px-2 py-2.5 text-center text-[11px] font-medium leading-tight text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-green-600";

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
  variant: "desktop" | "mobile" | "mobile-grid";
}) {
  if (variant === "mobile-grid") {
    return (
      <Link
        href={href}
        className={cn(mobileGridLinkBase, active && "bg-green-50 font-semibold text-[#326b29] hover:bg-green-50")}
        aria-current={active ? "page" : undefined}
      >
        <AccountHubIcon name={icon} size={18} className="h-[18px] w-[18px]" />
        <span>{label}</span>
      </Link>
    );
  }

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
      {active ? <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
    </Link>
  );
}

export function MobileAccountNav({ variant = "scroll" }: { variant?: "scroll" | "grid" }) {
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
    if (variant === "grid") return;
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
  }, [pathname, updateScrollHints, variant]);

  const scrollByDir = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 180, behavior: "smooth" });
  };

  if (variant === "grid") {
    return (
      <>
        <nav aria-label="Account navigation" className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:grid-cols-6 lg:hidden">
          {ACCOUNT_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isAccountNavActive(pathname, item.href)}
              variant="mobile-grid"
            />
          ))}
          <button type="button" onClick={() => setLogoutOpen(true)} className={cn(mobileGridLinkBase, "text-rose-600 hover:bg-rose-50")}>
            <AccountHubIcon name="logout" size={18} className="h-[18px] w-[18px]" />
            <span>Sign Out</span>
          </button>
        </nav>
        <LogoutConfirmModal open={logoutOpen} onClose={() => setLogoutOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="relative -mx-4 lg:hidden">
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

export default function AccountSidebar({ showMobileNav = true }: { showMobileNav?: boolean }) {
  const pathname = usePathname();
  const { customer } = useAuth();
  const name = getCustomerDisplayName(customer);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <>
      {showMobileNav ? <MobileAccountNav /> : null}

      {/* Desktop: vertical sidebar */}
      <aside className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white lg:sticky lg:top-[calc(var(--app-header-height,136px)+1rem)] lg:flex lg:flex-col lg:self-start">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-sm font-semibold text-[#326b29] ring-1 ring-green-100">{initials}</div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-900" title={name}>{name}</p>
              {customer?.email ? <p className="mt-1 truncate text-[11px] text-slate-500" title={customer.email}>{customer.email}</p> : null}
            </div>
          </div>
        </div>
        <nav className="flex flex-col p-2" aria-label="Account navigation">
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

        <div className="border-t border-slate-100 p-2">
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
