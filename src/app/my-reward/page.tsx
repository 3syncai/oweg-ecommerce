"use client";

import { useAuth } from "@/contexts/AuthProvider";
import { Crown, Gift, Loader2, Star, History, TrendingUp, Clock, FileText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
// Using native Date methods for formatting
// We can use Intl.NumberFormat for currency

const tiers = [
  { name: "Green", spend: "₹0 - ₹14,999", perk: "1% back as OWEG Coins" },
  { name: "Lime", spend: "₹15,000 - ₹49,999", perk: "2% back + early access to specials" },
  { name: "Emerald", spend: "₹50,000+", perk: "3% back + priority delivery slots" },
];

const perks = [
  "Coins apply like cash at checkout (1 Coin = ₹1)",
  "Birthday perks and surprise upgrades",
  "Faster support with live chat priority",
  "Exclusive bundle prices every month",
];

export default function MyRewardPage() {
  const { customer } = useAuth();
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const TX_PAGE_SIZE = 20;

  useEffect(() => {
    const fetchWallet = async () => {
      if (!customer?.id) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/store/wallet?limit=${TX_PAGE_SIZE}&offset=0`, {
          headers: { "x-customer-id": customer.id },
        });
        if (res.ok) {
          const data = await res.json();
          setWallet(data);
        }
      } catch (err) {
        console.error("Failed to fetch wallet stats", err);
      } finally {
        setLoading(false);
      }
    };

    fetchWallet();
  }, [customer]);

  const loadMoreTransactions = async () => {
    if (!customer?.id || !wallet || loadingMore || !wallet.has_more_transactions) return;
    setLoadingMore(true);
    try {
      const offset = (wallet.transactions || []).length;
      const res = await fetch(`/api/store/wallet?limit=${TX_PAGE_SIZE}&offset=${offset}`, {
        headers: { "x-customer-id": customer.id },
      });
      if (res.ok) {
        const data = await res.json();
        setWallet((prev: any) => ({
          ...prev,
          ...data,
          transactions: [...(prev?.transactions || []), ...(data.transactions || [])],
        }));
      }
    } catch (err) {
      console.error("Failed to load more wallet history", err);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="oweg-page flex min-h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--oweg-green-dark)]" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="oweg-page flex min-h-screen flex-col items-center justify-center space-y-4 px-4">
        <h1 className="oweg-title text-2xl">Sign in to view rewards</h1>
        <p className="oweg-subtle max-w-md text-center">Join the OWEG ecosystem to start earning coins on every purchase.</p>
        <Link href="/login?redirect=/my-reward" className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">
          Sign In / Join
        </Link>
      </div>
    )
  }

  return (
    <div className="oweg-page min-h-screen text-[var(--oweg-ink)]">
      <div className="oweg-container max-w-5xl space-y-8 py-8 md:space-y-10 md:py-10">

        {/* Wallet Dashboard Section */}
        <section className="oweg-surface-card relative overflow-hidden p-5 sm:p-8">
          <div className="pointer-events-none absolute right-0 top-0 p-8 opacity-10">
            <img src="/uploads/coin/coin.png" alt="" className="h-40 w-40 object-contain sm:h-64 sm:w-64" />
          </div>

          <div className="relative z-10 grid gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
            {/* Main Balance */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Available Balance</p>
              <div className="flex items-center gap-3">
                <img src="/uploads/coin/coin.png" alt="Coin" className="h-10 w-10 object-contain sm:h-12 sm:w-12" />
                <span className="text-4xl font-bold text-gray-900 sm:text-5xl">{(wallet?.balance || 0).toFixed(0)}</span>
              </div>
              <p className="text-emerald-700 text-sm font-medium pl-1">Worth ₹{(wallet?.balance || 0).toFixed(0)} at checkout</p>
              {wallet?.lifetime_earned != null && wallet?.lifetime_spent != null && (
                <p className="text-xs text-gray-500 pl-1">
                  Earned {Math.round(wallet.lifetime_earned)} · Used {Math.round(wallet.lifetime_spent)}
                </p>
              )}
              {wallet?.adjustment_message && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1 inline-block mt-2">
                  {wallet.adjustment_message}
                </p>
              )}
            </div>

            {/* Status Stats */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                <div className="bg-amber-100 p-2 rounded-full">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-amber-800 font-semibold">Pending & Locked</p>
                  <p className="text-lg font-bold text-amber-900">
                    {((wallet?.pending_coins || 0) + (wallet?.locked_coins || 0)).toFixed(0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border border-purple-100">
                <div className="bg-purple-100 p-2 rounded-full">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-purple-800 font-semibold">Lifetime Earned</p>
                  <p className="text-lg font-bold text-purple-900">
                    {Math.round(Number(wallet?.lifetime_earned) || 0)}
                  </p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="flex flex-col items-start justify-center space-y-3 border-t border-[var(--oweg-border)] pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <h3 className="font-semibold text-gray-900">Spend your coins</h3>
              <p className="text-sm text-gray-500">Apply coins directly at checkout for instant discounts.</p>
              <Link href="/" className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
                Shop Now
              </Link>
            </div>
          </div>
        </section>

        {/* Transaction History */}
        {wallet?.transactions && wallet.transactions.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-gray-400" />
              <h2 className="text-xl font-bold text-gray-900">Coin History</h2>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50 font-medium text-gray-500">
                    <tr>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Description / Order</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Date</th>
                      <th className="px-4 py-3 sm:px-6 sm:py-4">Status</th>
                      <th className="px-4 py-3 text-right sm:px-6 sm:py-4">Coins</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {wallet.transactions.map((tx: any) => (
                      <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="space-y-0.5">
                            <div className="font-medium text-gray-900">{tx.description}</div>
                            {tx.order_id && (
                              <Link href={`/order/details/${tx.order_id}`} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                View Order
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {new Date(tx.created_at).toLocaleDateString()}
                          <span className="text-xs text-gray-400 block">
                            {new Date(tx.created_at).toLocaleTimeString()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">
                            {tx.status || "COMPLETED"}
                          </span>
                        </td>
                        <td className={`px-6 py-4 text-right font-bold flex items-center justify-end gap-1 ${tx.transaction_type === 'EARN' ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.transaction_type === 'EARN' ? '+' : '-'}
                          {Math.abs(Number(tx.amount)).toFixed(0)}
                          <img src="/uploads/coin/coin.png" alt="Coin" className="w-4 h-4 object-contain" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {wallet.has_more_transactions ? (
                <div className="border-t border-gray-100 p-4 text-center">
                  <button
                    type="button"
                    onClick={() => void loadMoreTransactions()}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Load more history
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        )}

        <div className="border-t border-gray-100 my-8"></div>

        {/* Existing Static Content */}
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <Crown className="w-4 h-4" />
            My Reward Tiers
          </div>
          <h1 className="oweg-title text-2xl">Earn coins, unlock perks, stay VIP.</h1>
          <Link
            href="/reward-policy"
            className="inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
          >
            Read Reward Points Terms
          </Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {tiers.map((tier) => (
            <div key={tier.name} className="oweg-surface-card space-y-2 p-5 sm:p-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
                <Star className="w-4 h-4" />
                {tier.name}
              </div>
              <div className="text-lg font-semibold">{tier.spend}</div>
              <p className="text-sm text-gray-600">{tier.perk}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
            <Gift className="w-4 h-4" />
            How to use coins
          </div>
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
            {perks.map((perk) => (
              <li key={perk}>{perk}</li>
            ))}
          </ul>
        </section>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm font-semibold">
          Check back here anytime to track your progress and see your unlocked rewards.
        </div>
      </div>
    </div>
  );
}
