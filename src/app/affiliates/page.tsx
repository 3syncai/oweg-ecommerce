import { ArrowRight, Link2, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";

const benefits = [
  "High-converting product storytelling + rich creatives",
  "Transparent commissions with live dashboards",
  "Exclusive drops and launch-day boosts",
  "Cookie + click attribution with fair lookback",
];

export default function AffiliatesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/35 to-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <TrendingUp className="w-4 h-4" />
            Affiliate Program
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Share OWEG and earn on every conversion.</h1>
          <p className="text-gray-600">Appliance shoppers convert fast with strong intent. We give you transparent tracking and timely payouts.</p>
          <Link
            href="mailto:affiliates@oweg.in?subject=Join%20OWEG%20Affiliate"
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-emerald-600 text-white px-5 py-3 text-sm font-semibold shadow hover:bg-emerald-700"
          >
            Apply as affiliate
            <ArrowRight className="w-4 h-4" />
          </Link>
        </header>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
            <Link2 className="w-4 h-4" />
            Why creators choose us
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <div key={benefit} className="rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-100 px-4 py-3 text-sm font-semibold">
                {benefit}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-2 text-sm text-gray-700">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
            <Sparkles className="w-4 h-4" />
            Getting started
          </div>
          <ol className="list-decimal list-inside space-y-2">
            <li>Apply with your channel + audience details.</li>
            <li>Receive your unique links and brand kit.</li>
            <li>Track clicks, conversions, and payouts in your dashboard.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
