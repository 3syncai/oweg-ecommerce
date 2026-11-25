"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
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

function NavLink({ href, label, icon, active }: {
  href: string;
  label: string;
  icon: (typeof ACCOUNT_NAV)[number]["icon"];
  active: boolean;
}) {
  return (
    <Link href={href} className={cn(navLinkBase, active && navLinkActive)} aria-current={active ? "page" : undefined}>
      <AccountHubIcon name={icon} size={20} className="h-5 w-5 shrink-0" />
      <span>{label}</span>
      {active && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden />}
    </Link>
  );
}

function MobileAccountNav() {
  const pathname = usePathname();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const current = ACCOUNT_NAV.find(item => isAccountNavActive(pathname, item.href));

  return (
    <>
      <details key={pathname} className="group rounded-xl border border-slate-200 bg-white lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[#145448] focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">Account menu{current ? <span className="ml-2 font-normal text-slate-600">· {current.label}</span> : null}</span>
          <ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden />
        </summary>
        <nav className="grid gap-1 border-t border-slate-100 p-2 [&_a]:min-h-11" aria-label="Account navigation">
          {ACCOUNT_NAV.map(item => <NavLink key={item.href} {...item} active={isAccountNavActive(pathname, item.href)} />)}
          <button type="button" onClick={() => setLogoutOpen(true)} className={cn(navLinkBase, "min-h-11 text-[#82383a] hover:bg-rose-50")}>
            <AccountHubIcon name="logout" size={20} className="size-5 shrink-0" />
            Sign out
          </button>
        </nav>
      </details>
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
            />
          ))}
        </nav>

        <div className="border-t border-slate-100 p-2">
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            className={cn(
              navLinkBase,
              "w-full rounded-lg text-[#82383a] hover:bg-rose-50"
            )}
          >
            <AccountHubIcon name="logout" size={20} className="h-5 w-5 shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <LogoutConfirmModal open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </>
  );
}
