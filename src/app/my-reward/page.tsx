"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock, History, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import BrandLoader from "@/components/ui/BrandLoader";

type Transaction = {
  id: string;
  description?: string;
  transaction_type?: string;
  order_id?: string | null;
  created_at: string;
  status?: string;
  amount: number;
};

type WalletSnapshot = {
  balance: number;
  pending_coins: number;
  locked_coins: number;
  lifetime_earned: number;
  lifetime_spent: number;
  adjustment_message?: string | null;
  can_redeem?: boolean;
  has_more_transactions: boolean;
  transactions: Transaction[];
};

const coins = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const dates = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
const activityLabels: Record<string, string> = {
  EARN: "Coins earned",
  SPEND: "Coins used",
  REVERSE: "Coins reversed",
  REFUND: "Coins refunded",
  ADJUST: "Balance adjustment",
};
const action = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#155344] px-4 py-2 text-sm font-semibold text-white hover:bg-[#103e33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155344] disabled:opacity-60";

async function fetchWallet(customerId: string, offset: number, signal: AbortSignal): Promise<WalletSnapshot> {
  const response = await fetch(`/api/store/wallet?limit=20&offset=${offset}`, {
    cache: "no-store",
    headers: { "x-customer-id": customerId },
    signal,
  });
  if (!response.ok) throw new Error("Wallet request failed");
  return response.json();
}

function RewardWallet({ customerId }: { customerId: string }) {
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchWallet(customerId, 0, controller.signal)
      .then(data => { if (!controller.signal.aborted) setWallet(data); })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn’t load your rewards."); });
    return () => {
      controller.abort();
      moreRequest.current?.abort();
    };
  }, [customerId, attempt]);

  async function loadMore() {
    if (!wallet?.has_more_transactions || moreRequest.current) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    setLoadingMore(true);
    setError("");
    try {
      const next = await fetchWallet(customerId, wallet.transactions.length, controller.signal);
      if (!controller.signal.aborted) {
        setWallet({ ...next, transactions: [...wallet.transactions, ...next.transactions] });
      }
    } catch {
      if (!controller.signal.aborted) setError("We couldn’t load more coin activity. Please try again.");
    } finally {
      moreRequest.current = null;
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  if (!wallet) {
    return error ? (
      <section className="rounded-2xl border border-[#dce6dc] bg-white p-6">
        <p role="alert">{error}</p>
        <button type="button" className={`${action} mt-3`} onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button>
      </section>
    ) : <BrandLoader label="Loading your rewards…" />;
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section aria-labelledby="balance-heading" className="rounded-3xl bg-[#173f34] p-5 text-white sm:p-7">
          <h2 id="balance-heading" className="font-semibold text-[#e3eee1]">Available balance</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Image src="/uploads/coin/coin.png" width={44} height={44} alt="" />
            <p className="break-all text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">{coins.format(wallet.balance)}</p>
            <span className="text-sm text-[#e3eee1]">OWEG Coins</span>
          </div>
          <p className="mt-3 text-sm text-[#e3eee1]">{wallet.can_redeem === false && wallet.balance > 0 ? "Redemption is currently unavailable." : `Worth ₹${coins.format(wallet.balance)} at checkout`}</p>
          {wallet.adjustment_message && <p className="mt-4 rounded-xl bg-white/10 p-3 text-sm">{wallet.adjustment_message}</p>}
        </section>
        <dl className="grid grid-cols-2 gap-3 rounded-3xl border border-[#dce6dc] bg-white p-4 sm:p-5">
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f4f7ef] p-3">
            <dt className="flex items-center gap-2 text-sm font-medium"><Clock size={17} aria-hidden="true" /> Pending &amp; locked</dt>
            <dd className="font-bold tabular-nums">{coins.format(wallet.pending_coins + wallet.locked_coins)}</dd>
          </div>
          <div className="min-w-0 p-2"><dt className="text-sm text-[#486056]">Lifetime earned</dt><dd className="break-all text-xl font-bold tabular-nums">{coins.format(wallet.lifetime_earned)}</dd></div>
          <div className="min-w-0 p-2"><dt className="text-sm text-[#486056]">Coins used</dt><dd className="break-all text-xl font-bold tabular-nums">{coins.format(wallet.lifetime_spent)}</dd></div>
        </dl>
      </div>

      <section aria-labelledby="activity-heading" className="rounded-2xl border border-[#dce6dc] bg-white">
        <h2 id="activity-heading" className="flex items-center gap-2 px-5 py-4 text-xl font-semibold"><History size={20} aria-hidden="true" /> Coin activity</h2>
        {wallet.transactions.length ? (
          <ul className="divide-y divide-[#e5ece4] border-t border-[#e5ece4]">
            {wallet.transactions.map(transaction => {
              const date = new Date(transaction.created_at);
              return (
                <li key={transaction.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)] gap-2 px-5 py-3">
                  <div className="min-w-0 break-words">
                    <p className="font-semibold">{transaction.description || activityLabels[transaction.transaction_type ?? ""] || "Wallet transaction"}</p>
                    {Number.isFinite(date.getTime()) && <time dateTime={transaction.created_at} className="block text-xs text-[#486056]">{dates.format(date)}</time>}
                    {transaction.order_id && <Link prefetch={false} href={`/account/orders/${encodeURIComponent(transaction.order_id)}`} className="inline-flex min-h-11 items-center text-sm font-medium text-[#155344] underline">View order</Link>}
                  </div>
                  <div className="min-w-0 break-all text-right">
                    <p className="font-bold tabular-nums">{transaction.amount > 0 ? "+" : ""}{coins.format(transaction.amount)}</p>
                    <p className="text-xs text-[#486056]">{transaction.status || "COMPLETED"}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className="px-5 pb-5 text-sm text-[#486056]">No coin activity yet. Earned and used coins will appear here.</p>}
        {error && <p role="alert" className="px-5 py-2 text-sm text-red-800">{error}</p>}
        {wallet.has_more_transactions && <div className="border-t border-[#e5ece4] p-4">
          <button type="button" className={action} disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading activity…" : "Load more activity"}</button>
        </div>}
      </section>
    </>
  );
}

export default function MyRewardPage() {
  const { customer, initializing } = useAuth();

  return (
    <div className="oweg-page text-[#17372f]">
      <div className="oweg-container max-w-5xl space-y-4 py-5 sm:space-y-5 sm:py-10">
        <header>
          <h1 className="oweg-title text-3xl sm:text-4xl">My rewards</h1>
          <p className="mt-1 text-sm text-[#486056]">Track your OWEG Coins and see what’s available at checkout.</p>
        </header>
        {initializing ? <BrandLoader label="Loading your rewards…" /> : customer ? (
          <RewardWallet key={customer.id} customerId={customer.id} />
        ) : (
          <section className="rounded-3xl border border-[#dce6dc] bg-white p-5 sm:p-7">
            <Wallet size={24} aria-hidden="true" />
            <h2 className="mt-3 text-xl font-semibold">Sign in to see your rewards</h2>
            <Link href="/login?redirect=/my-reward" className={`${action} mt-4`}>Sign in</Link>
          </section>
        )}
        <section aria-labelledby="using-coins" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dce6dc] bg-white p-5">
          <div>
            <h2 id="using-coins" className="font-semibold">Using your coins</h2>
            <p className="mt-1 text-sm text-[#486056]">Apply available coins at checkout on eligible orders.</p>
            <Link href="/reward-policy" className="inline-flex min-h-11 items-center text-sm font-medium text-[#155344] underline">Read the reward terms</Link>
          </div>
          <Link href="/" className={action}>Continue shopping <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      </div>
    </div>
  );
}
