"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import type { AccountHubIconName } from "@/components/ui/icons/account-hub";
import { useAuth } from "@/contexts/AuthProvider";
import { useAccountAddresses } from "@/hooks/useAccountAddresses";
import { useAccountOrdersSummary } from "@/hooks/useAccountOrdersSummary";
import { useAccountWallet } from "@/hooks/useAccountWallet";

type QuickStatItem = {
  label: string;
  href: string;
  icon?: AccountHubIconName;
  imageSrc?: string;
  value: string;
  loading: boolean;
};

type QuickStatCardProps = QuickStatItem;

function QuickStatCard({ label, href, icon, imageSrc, value, loading }: QuickStatCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-gray-200 bg-white shadow-sm p-4 transition-all hover:border-[#66C940] hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF8E7] transition-colors group-hover:bg-[#dff5d8]">
          {imageSrc ? (
            <img src={imageSrc} alt="" className="h-7 w-7 object-contain" />
          ) : icon ? (
            <AccountHubIcon name={icon} size={20} className="h-5 w-5" />
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-[#1F2A33]">
        {loading ? "…" : value}
      </p>
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
      label: "Coins",
      href: "/my-reward",
      imageSrc: "/uploads/coin/coin.png",
      value: coinBalance.toFixed(0),
      loading: walletLoading,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {stats.map((stat) => (
        <QuickStatCard key={stat.label} {...stat} />
      ))}
    </div>
  );
}
