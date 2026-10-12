"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
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
      className="group min-w-0 bg-white p-3 transition-colors hover:bg-green-50/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-green-600 sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-500">
          {imageSrc ? (
            <img src={imageSrc} alt="" className="h-4 w-4 object-contain" />
          ) : icon ? (
            <AccountHubIcon name={icon} size={16} className="h-4 w-4" />
          ) : null}
          <span className="text-[11px] font-medium sm:text-xs">{label}</span>
        </div>
        <ArrowUpRight className="hidden h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-[#326b29] sm:block" aria-hidden />
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight text-slate-900 sm:mt-3 sm:text-2xl">
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
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:grid-cols-4">
      {stats.map((stat) => (
        <QuickStatCard key={stat.label} {...stat} />
      ))}
    </div>
  );
}
