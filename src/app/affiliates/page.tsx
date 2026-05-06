"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Coins,
  Copy,
  Loader2,
  LogIn,
  PartyPopper,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";

type AffiliateRecord = {
  id: string;
  customer_id: string;
  refer_code: string;
  email: string | null;
  name: string | null;
  earned_coins: number;
  pending_coins: number;
  created_at: string;
};

const benefits = [
  { icon: Users, text: "Refer friends & family with your unique code" },
  { icon: Coins, text: "Earn coins on every successful order" },
  { icon: TrendingUp, text: "Live dashboard with referrals & earnings" },
  { icon: Sparkles, text: "Share product links with one tap" },
];

export default function AffiliatesPage() {
  const router = useRouter();
  const { customer, initializing } = useAuth();

  const [checking, setChecking] = useState(true);
  const [affiliate, setAffiliate] = useState<AffiliateRecord | null>(null);
  const [registering, setRegistering] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initializing) return;
    if (!customer?.id) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/customer-affiliate/me", {
          headers: { "x-customer-id": customer.id },
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (data?.is_affiliate && data.affiliate) {
          setAffiliate(data.affiliate as AffiliateRecord);
          // Existing affiliate: send straight to dashboard
          router.replace("/affiliate-customer");
          return;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to check status");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customer, initializing, router]);

  const handleBecomeAffiliate = async () => {
    if (!customer?.id) return;
    setRegistering(true);
    setError(null);
    try {
      const res = await fetch("/api/customer-affiliate/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-customer-id": customer.id,
        },
        credentials: "include",
        body: JSON.stringify({
          customer_id: customer.id,
          email: customer.email ?? null,
          name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Could not register as affiliate");
      }
      setAffiliate(data.affiliate as AffiliateRecord);
      setShowCelebration(true);
      setTimeout(() => {
        router.push("/affiliate-customer");
      }, 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRegistering(false);
    }
  };

  const copyCode = async () => {
    if (!affiliate?.refer_code) return;
    try {
      await navigator.clipboard.writeText(affiliate.refer_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (initializing || checking) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  // Not signed in → ask the user to register/login first
  if (!customer) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/35 to-white text-gray-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="rounded-3xl border border-emerald-100 bg-white p-8 shadow-sm">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold mb-4">
              <TrendingUp className="w-4 h-4" />
              OWEG Affiliate Program
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold mb-3">
              Earn coins by sharing OWEG with your friends.
            </h1>
            <p className="text-gray-600 mb-6">
              You need an OWEG account to become an affiliate. Please register or sign in
              first — it only takes a minute.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/signup?redirect=/affiliates"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-5 py-3 text-sm font-semibold shadow hover:bg-emerald-700 transition"
              >
                Register on OWEG
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/login?redirect=/affiliates"
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 text-emerald-700 px-5 py-3 text-sm font-semibold hover:bg-emerald-50 transition"
              >
                <LogIn className="w-4 h-4" />
                I already have an account
              </Link>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mt-8">
              {benefits.map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex items-start gap-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 p-4 text-sm text-emerald-900"
                >
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Signed in, but not an affiliate yet → show "Become an Affiliate" CTA
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/35 to-white text-gray-900 relative overflow-hidden">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="rounded-3xl border border-emerald-100 bg-white p-8 shadow-sm relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold mb-4">
            <Sparkles className="w-4 h-4" />
            Hi {customer.first_name || "there"}, ready to earn?
          </div>

          <h1 className="text-3xl sm:text-4xl font-semibold mb-3">
            Become an OWEG Affiliate
          </h1>
          <p className="text-gray-600 mb-6">
            Get your own referral code, share it with friends & family, and earn coins on
            every successful order they place.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            {benefits.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-start gap-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 p-4 text-sm text-emerald-900"
              >
                <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          {error ? (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleBecomeAffiliate}
            disabled={registering || showCelebration}
            className="affiliate-cta inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-6 py-3.5 text-base font-semibold shadow hover:bg-emerald-700 disabled:opacity-70 disabled:cursor-not-allowed transition"
          >
            {registering ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Setting up your code…
              </>
            ) : (
              <>
                Become an Affiliate
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Celebration overlay shown after successful registration */}
      {showCelebration && affiliate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="celebrate-card relative w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
            <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
              {Array.from({ length: 18 }).map((_, i) => (
                <span
                  key={i}
                  className="confetti"
                  style={{
                    left: `${(i * 5.5) % 100}%`,
                    background: ["#10b981", "#059669", "#34d399", "#fbbf24", "#f97316"][i % 5],
                    animationDelay: `${(i * 0.08).toFixed(2)}s`,
                  }}
                />
              ))}
            </div>

            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 pop-in">
              <PartyPopper className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-semibold mb-1">You&apos;re an affiliate!</h2>
            <p className="text-sm text-gray-600 mb-5">
              Here&apos;s your referral code. Share it to start earning coins.
            </p>

            <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 py-3 mb-4">
              <span className="flex-1 font-mono text-2xl tracking-widest font-semibold text-emerald-700">
                {affiliate.refer_code}
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Redirecting you to your dashboard…
            </p>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .affiliate-cta {
          position: relative;
          overflow: hidden;
        }
        .affiliate-cta::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.35),
            transparent
          );
          transform: translateX(-100%);
          transition: transform 0.6s ease;
        }
        .affiliate-cta:hover::after {
          transform: translateX(100%);
        }
        .celebrate-card {
          animation: card-pop 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .pop-in {
          animation: pop-in 480ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes card-pop {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.92);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes pop-in {
          0% {
            transform: scale(0.4);
            opacity: 0;
          }
          70% {
            transform: scale(1.15);
            opacity: 1;
          }
          100% {
            transform: scale(1);
          }
        }
        .confetti {
          position: absolute;
          top: -10%;
          width: 8px;
          height: 14px;
          border-radius: 2px;
          opacity: 0.9;
          animation: fall 1.6s linear forwards;
        }
        @keyframes fall {
          0% {
            transform: translateY(-10%) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(420px) rotate(540deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
