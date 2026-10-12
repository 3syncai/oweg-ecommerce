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
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-3.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-2 break-words text-base font-semibold tabular-nums tracking-tight text-slate-900 sm:text-lg">
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <AccountHubIcon name="account-summary" size={18} className="h-[18px] w-[18px]" />
        <h2 className="text-sm font-semibold text-slate-900">
          Account Summary
        </h2>
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
    </section>
  );
}
