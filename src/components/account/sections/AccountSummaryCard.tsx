"use client";

import { useMemo } from "react";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import { useAuth } from "@/contexts/AuthProvider";
import { formatAccountCurrency } from "@/lib/account-utils";
import { useAccountOrdersSummary } from "@/hooks/useAccountOrdersSummary";

type SummaryStatProps = {
  label: string;
  value: string;
  loading?: boolean;
};

function SummaryStat({ label, value, loading }: SummaryStatProps) {
  return (
    <div className="rounded-lg border border-gray-100 bg-[#FAFAFA] px-4 py-3 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-[#1F2A33] md:text-xl">
        {loading ? "…" : value}
      </p>
    </div>
  );
}

export default function AccountSummaryCard() {
  const { customer } = useAuth();
  const { counts, totalSpent, loading, orders } = useAccountOrdersSummary();

  const savedItemsCount = useMemo(() => {
    const list = (customer?.metadata as Record<string, unknown> | undefined)?.wishlist;
    if (Array.isArray(list)) return list.length;
    return 0;
  }, [customer?.metadata]);

  const currencyCode = orders[0]?.currency_code;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <AccountHubIcon name="account-summary" size={22} className="h-[22px] w-[22px]" />
        <h3 className="text-base font-semibold text-[#1F2A33] md:text-lg">
          Account Summary
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryStat
          label="Total Orders"
          value={String(counts.all)}
          loading={loading}
        />
        <SummaryStat
          label="Total Spent"
          value={formatAccountCurrency(totalSpent, currencyCode)}
          loading={loading}
        />
        <SummaryStat
          label="Saved Items"
          value={String(savedItemsCount)}
        />
      </div>
    </div>
  );
}
