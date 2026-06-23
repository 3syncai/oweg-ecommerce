import type { AccountHubIconName } from "@/components/ui/icons/account-hub";

export type AccountNavItem = {
  href: string;
  label: string;
  icon: AccountHubIconName;
};

export const ACCOUNT_NAV: AccountNavItem[] = [
  { href: "/account", label: "My Account", icon: "my-account" },
  { href: "/account/orders", label: "Orders", icon: "orders" },
  { href: "/account/wishlist", label: "Wishlist", icon: "wishlist" },
  { href: "/account/addresses", label: "Addresses", icon: "addresses" },
  { href: "/account/preferences", label: "Preferences", icon: "preferences" },
  { href: "/account/help", label: "Help & Support", icon: "help-and-support" },
];

export function isAccountNavActive(pathname: string, href: string): boolean {
  if (href === "/account") {
    return pathname === "/account";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
