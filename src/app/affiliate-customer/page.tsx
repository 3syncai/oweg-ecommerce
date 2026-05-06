"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowRight,
  Ban,
  Check,
  Coins,
  Copy,
  Hourglass,
  Link2,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Sparkles,
  Undo2,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";

type AffiliateStats = {
  is_affiliate: boolean;
  refer_code?: string;
  coins?: {
    earned: number;
    pending: number;
    earned_log_amount?: number;
    pending_log_amount?: number;
    cancelled_log_amount?: number;
    reversed_log_amount?: number;
  };
  summary?: {
    total_referrals: number;
    active_referrals: number;
    total_orders: number;
    total_order_value: number;
  };
  referrals?: Array<{
    id: string;
    referred_customer_id: string;
    referred_email: string | null;
    referred_name: string | null;
    total_orders: number;
    total_order_value: number;
    coins_earned: number;
    first_order_at: string | null;
    referred_at: string;
  }>;
  recent_activity?: Array<{
    id: string;
    order_id: string | null;
    referred_customer_id: string | null;
    coins: number;
    status: string;
    reason: string | null;
    created_at: string;
    unlocked_at: string | null;
  }>;
};

type AffiliateProduct = {
  id: string;
  handle: string;
  name: string;
  image: string;
  price: number;
};

function formatCoins(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

type StatsFetchKey = readonly ["affiliate-stats", string];
type ProductsFetchKey = readonly ["affiliate-products", number];

const statsFetcher = async ([, customerId]: StatsFetchKey): Promise<AffiliateStats> => {
  const res = await fetch("/api/customer-affiliate/stats", {
    headers: { "x-customer-id": customerId },
    credentials: "include",
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Failed to load stats");
  return data as AffiliateStats;
};

const productsFetcher = async ([, limit]: ProductsFetchKey): Promise<AffiliateProduct[]> => {
  const res = await fetch(`/api/customer-affiliate/products?limit=${limit}`, {
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Failed to load products");
  return (data.products || []) as AffiliateProduct[];
};

export default function AffiliateCustomerDashboard() {
  const router = useRouter();
  const { customer, initializing } = useAuth();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const origin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const {
    data: stats,
    error,
    isLoading: statsLoading,
    isValidating: statsValidating,
    mutate: refreshStats,
  } = useSWR<AffiliateStats, Error, StatsFetchKey | null>(
    customer?.id ? (["affiliate-stats", customer.id] as const) : null,
    statsFetcher,
    {
      refreshInterval: 15000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    }
  );

  const {
    data: products,
    isLoading: productsLoading,
  } = useSWR<AffiliateProduct[], Error, ProductsFetchKey>(
    ["affiliate-products", 24] as const,
    productsFetcher,
    {
      refreshInterval: 60000,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  useEffect(() => {
    if (initializing) return;
    if (!customer?.id) {
      router.replace("/login?redirect=/affiliate-customer");
    }
  }, [customer, initializing, router]);

  useEffect(() => {
    if (stats && stats.is_affiliate === false) {
      router.replace("/affiliates");
    }
  }, [stats, router]);

  const referCode = stats?.refer_code || "";

  const buildShareLink = useCallback(
    (product?: { handle?: string | null; id?: string | null } | null) => {
      if (!referCode) return "";
      if (!product || (!product.handle && !product.id)) {
        return `${origin}/?ref=${encodeURIComponent(referCode)}`;
      }
      const slug = product.handle || product.id || "";
      const params = new URLSearchParams();
      if (product.id) params.set("id", product.id);
      params.set("ref", referCode);
      return `${origin}/productDetail/${encodeURIComponent(slug)}?${params.toString()}`;
    },
    [origin, referCode]
  );

  const copyText = async (key: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 1400);
    } catch {
      /* ignore */
    }
  };

  if (initializing || (statsLoading && !stats)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-700 mb-4">{error?.message || "Could not load your affiliate data."}</p>
        <Link
          href="/affiliates"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-5 py-3 text-sm font-semibold"
        >
          Go to Affiliate Program
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const earned = stats.coins?.earned ?? 0;
  const pending = stats.coins?.pending ?? 0;
  const cancelled = stats.coins?.cancelled_log_amount ?? 0;
  const reversed = stats.coins?.reversed_log_amount ?? 0;
  const totalReferrals = stats.summary?.total_referrals ?? 0;
  const activeReferrals = stats.summary?.active_referrals ?? 0;
  const totalOrders = stats.summary?.total_orders ?? 0;
  const totalOrderValue = stats.summary?.total_order_value ?? 0;
  const recentActivity = stats.recent_activity ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/40 to-white text-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              Affiliate Dashboard
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold">
              Welcome back{customer?.first_name ? `, ${customer.first_name}` : ""}!
            </h1>
            <p className="text-gray-600 mt-1 text-sm">
              Track your referrals, coins, and share product links.
            </p>
          </div>
          <button
            onClick={() => void refreshStats()}
            disabled={statsValidating}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCcw className={`w-4 h-4 ${statsValidating ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {/* Referral code card */}
        <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-emerald-700 font-semibold mb-1">
                Your Referral Code
              </p>
              <p className="font-mono text-3xl sm:text-4xl tracking-widest font-semibold text-gray-900">
                {referCode}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyText("code", referCode)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 transition"
              >
                {copiedKey === "code" ? (
                  <>
                    <Check className="w-4 h-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Copy code
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => copyText("link", buildShareLink())}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-2.5 text-sm font-semibold hover:bg-emerald-100 transition"
              >
                {copiedKey === "link" ? (
                  <>
                    <Check className="w-4 h-4" /> Link copied
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" /> Copy share link
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Stats cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Referred Customers"
            value={formatCoins(totalReferrals)}
            sub={`${activeReferrals} active`}
            icon={<Users className="w-5 h-5" />}
            tone="emerald"
          />
          <StatCard
            label="Earned Coins"
            value={formatCoins(earned)}
            sub="Available to use"
            icon={<Coins className="w-5 h-5" />}
            tone="emerald"
          />
          <StatCard
            label="Pending Coins"
            value={formatCoins(pending)}
            sub="Will unlock after delivery"
            icon={<Hourglass className="w-5 h-5" />}
            tone="amber"
          />
          <StatCard
            label="Order Value Driven"
            value={formatINR(totalOrderValue)}
            sub={`${totalOrders} orders`}
            icon={<ArrowRight className="w-5 h-5" />}
            tone="slate"
          />
        </section>

        {(cancelled > 0 || reversed > 0) ? (
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cancelled > 0 ? (
              <StatCard
                label="Cancelled (lost)"
                value={formatCoins(cancelled)}
                sub="Pending coins lost to cancellations"
                icon={<Ban className="w-5 h-5" />}
                tone="rose"
              />
            ) : null}
            {reversed > 0 ? (
              <StatCard
                label="Reversed (returned)"
                value={formatCoins(reversed)}
                sub="Earned coins deducted after return"
                icon={<Undo2 className="w-5 h-5" />}
                tone="rose"
              />
            ) : null}
          </section>
        ) : null}

        {/* Referred customers */}
        <section className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Referred Customers</h2>
            <span className="text-xs text-gray-500">{totalReferrals} total</span>
          </div>
          {stats.referrals && stats.referrals.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left font-medium px-6 py-3">Customer</th>
                    <th className="text-left font-medium px-6 py-3">Referred on</th>
                    <th className="text-right font-medium px-6 py-3">Orders</th>
                    <th className="text-right font-medium px-6 py-3">Order value</th>
                    <th className="text-right font-medium px-6 py-3">Coins earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.referrals.map((r) => (
                    <tr key={r.id} className="hover:bg-emerald-50/40">
                      <td className="px-6 py-3">
                        <div className="font-medium text-gray-900">{r.referred_name || "—"}</div>
                        <div className="text-xs text-gray-500">{r.referred_email || "—"}</div>
                      </td>
                      <td className="px-6 py-3 text-gray-600">{formatDate(r.referred_at)}</td>
                      <td className="px-6 py-3 text-right">{r.total_orders}</td>
                      <td className="px-6 py-3 text-right">{formatINR(r.total_order_value)}</td>
                      <td className="px-6 py-3 text-right text-emerald-700 font-semibold">
                        {formatCoins(r.coins_earned)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center">
              <p className="text-sm text-gray-600 mb-1">No referrals yet.</p>
              <p className="text-xs text-gray-500">
                Share your code <span className="font-mono font-semibold">{referCode}</span> to get started.
              </p>
            </div>
          )}
        </section>

        {/* Recent coin activity */}
        <section className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <span className="text-xs text-gray-500">Latest 20 entries</span>
          </div>
          {recentActivity.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left font-medium px-6 py-3">When</th>
                    <th className="text-left font-medium px-6 py-3">Order</th>
                    <th className="text-left font-medium px-6 py-3">Reason</th>
                    <th className="text-right font-medium px-6 py-3">Coins</th>
                    <th className="text-right font-medium px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentActivity.map((a) => {
                    const isLoss = a.status === "CANCELLED" || a.status === "REVERSED";
                    return (
                      <tr key={a.id} className="hover:bg-emerald-50/40">
                        <td className="px-6 py-3 text-gray-600 whitespace-nowrap">
                          {formatDate(a.created_at)}
                        </td>
                        <td className="px-6 py-3 font-mono text-xs text-gray-600">
                          {a.order_id ? a.order_id.replace(/^order_/, "").slice(0, 12) + "…" : "—"}
                        </td>
                        <td className="px-6 py-3 text-gray-600 max-w-[280px]">
                          <span className="truncate block" title={a.reason || ""}>
                            {a.reason || "—"}
                          </span>
                        </td>
                        <td className={`px-6 py-3 text-right font-semibold ${isLoss ? "text-rose-600" : "text-emerald-700"}`}>
                          {isLoss ? "−" : "+"}
                          {formatCoins(a.coins)}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <StatusPill status={a.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-gray-600">
              No coin activity yet. Once a referred customer places an order, it&apos;ll show up here.
            </div>
          )}
        </section>

        {/* Products with referral link */}
        <section className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Share products</h2>
            <p className="text-xs text-gray-500 hidden sm:block">
              Tap a card to copy its referral link.
            </p>
          </div>

          {productsLoading && !products ? (
            <div className="p-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            </div>
          ) : !products || products.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-600">
              No products available right now.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 sm:p-6">
              {products.map((p) => {
                const link = buildShareLink({ handle: p.handle, id: p.id });
                const key = `prod-${p.id}`;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => copyText(key, link)}
                    className="group relative text-left rounded-2xl border border-gray-100 bg-white overflow-hidden hover:border-emerald-300 hover:shadow-md transition"
                  >
                    <div className="relative h-36 sm:h-40 bg-gray-50 overflow-hidden">
                      {p.image ? (
                        <Image
                          src={p.image}
                          alt={p.name || "Product"}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          className="object-contain group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : null}
                      <span
                        className={`absolute top-2 right-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${copiedKey === key
                          ? "bg-emerald-600 text-white"
                          : "bg-white/90 text-emerald-700 border border-emerald-200"
                          }`}
                      >
                        {copiedKey === key ? (
                          <>
                            <Check className="w-3 h-3" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> Copy link
                          </>
                        )}
                      </span>
                    </div>
                    <div className="p-3 space-y-1">
                      <p className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">
                        {p.name}
                      </p>
                      <p className="text-emerald-700 font-semibold text-sm">
                        {formatINR(p.price || 0)}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {link.replace(/^https?:\/\//, "")}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "emerald" | "amber" | "slate" | "rose";
}) {
  const toneClasses: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border ${toneClasses[tone]} mb-3`}>
        {icon}
      </div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {sub ? <p className="text-xs text-gray-500 mt-1">{sub}</p> : null}
    </div>
  );
}

const STATUS_STYLES: Record<string, { label: string; classes: string; icon: React.ReactNode }> = {
  PENDING: {
    label: "Pending",
    classes: "bg-amber-50 text-amber-700 border-amber-200",
    icon: <Hourglass className="w-3 h-3" />,
  },
  EARNED: {
    label: "Earned",
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: <Check className="w-3 h-3" />,
  },
  CANCELLED: {
    label: "Cancelled",
    classes: "bg-rose-50 text-rose-700 border-rose-200",
    icon: <Ban className="w-3 h-3" />,
  },
  REVERSED: {
    label: "Reversed",
    classes: "bg-rose-50 text-rose-700 border-rose-200",
    icon: <RotateCcw className="w-3 h-3" />,
  },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || {
    label: status,
    classes: "bg-slate-50 text-slate-700 border-slate-200",
    icon: null,
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.classes}`}>
      {s.icon}
      {s.label}
    </span>
  );
}
