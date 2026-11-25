"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowUpRight, Users } from "lucide-react";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import type { AccountHubIconName } from "@/components/ui/icons/account-hub";
import { useAuth } from "@/contexts/AuthProvider";
import { useAccountAddresses } from "@/hooks/useAccountAddresses";
import { useAccountOrdersSummary } from "@/hooks/useAccountOrdersSummary";
import { useAccountWallet } from "@/hooks/useAccountWallet";
import { storefrontAffiliateLink, storefrontRewardLink } from "@/lib/storefront-links";
import styles from "../AccountOverview.module.css";

type QuickStatItem = {
  label: string;
  href: string;
  icon?: AccountHubIconName;
  imageSrc?: string;
  value?: string;
  loading?: boolean;
};

type QuickStatCardProps = QuickStatItem;

function QuickStatCard({ label, href, icon, imageSrc, value, loading }: QuickStatCardProps) {
  return (
    <Link
      href={href}
      className={`group ${styles.shortcut}`}
    >
        <span className={styles.shortcutIcon}>
          {imageSrc ? (
            <img src={imageSrc} alt="" className="h-4 w-4 object-contain" />
          ) : icon ? (
            <AccountHubIcon name={icon} size={16} className="h-4 w-4" />
          ) : <Users className="size-4" aria-hidden="true" />}
        </span>
        <div className={styles.shortcutText}><span>{label}</span>
          {value !== undefined && <p>{loading ? "…" : value}</p>}
        </div>
        <ArrowUpRight className={styles.shortcutArrow} size={15} aria-hidden />
    </Link>
  );
}

export default function AccountQuickStats() {
  const { customer } = useAuth();
  const { counts, loading: ordersLoading } = useAccountOrdersSummary();
  const { addresses, loading: addressesLoading } = useAccountAddresses();
  const { wallet, loading: walletLoading } = useAccountWallet();

  const wishlistCount = useMemo(() => {
    const list = (customer?.metadata as Record<string, unknown> | undefined)?.wishlist;
    if (Array.isArray(list)) return list.length;
    return 0;
  }, [customer?.metadata]);

  const coinBalance = wallet?.display_balance ?? wallet?.balance ?? 0;

  const stats: QuickStatItem[] = [
    {
      label: "Orders",
      href: "/account/orders",
      icon: "orders",
      value: String(counts.all),
      loading: ordersLoading,
    },
    {
      label: "Wishlist",
      href: "/account/wishlist",
      icon: "wishlist",
      value: String(wishlistCount),
      loading: false,
    },
    {
      label: "Addresses",
      href: "/account/addresses",
      icon: "addresses",
      value: String(addresses.length),
      loading: addressesLoading,
    },
    {
      ...storefrontRewardLink,
      imageSrc: "/uploads/coin/coin.png",
      value: coinBalance.toFixed(0),
      loading: walletLoading,
    },
    storefrontAffiliateLink,
  ];

  return (
    <nav className={styles.shortcuts} aria-label="Shopping shortcuts">
      {stats.map((stat) => (
        <QuickStatCard key={stat.label} {...stat} />
      ))}
    </nav>
  );
}
