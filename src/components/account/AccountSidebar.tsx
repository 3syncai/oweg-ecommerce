"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

export default function AccountSidebar() {
  const pathname = usePathname();
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <>
      {/* Mobile: horizontal scroll nav */}
      <nav
        className="md:hidden -mx-4 px-4 overflow-x-auto scrollbar-hide"
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

      {/* Desktop: vertical sidebar */}
      <aside className="hidden md:flex md:flex-col md:self-start md:rounded-xl md:border md:border-gray-200 md:bg-white md:overflow-hidden">
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
