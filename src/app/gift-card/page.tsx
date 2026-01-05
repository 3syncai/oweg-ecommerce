import { ArrowRight, Gift, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";

const perks = [
  "Instant delivery to email or WhatsApp",
  "Custom messages and scheduled sends",
  "Works on appliances, gadgets, and accessories",
  "No hidden fees; remaining balance stays safe",
];

export default function GiftCardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <Gift className="w-4 h-4" />
            OWEG Gift Cards
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Gift appliances they’ll actually use.</h1>
          <p className="text-gray-600">Send instant gift cards for kitchen wins, home upgrades, and tech treats—delivered with zero friction.</p>
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-emerald-600 text-white px-5 py-3 text-sm font-semibold shadow hover:bg-emerald-700"
          >
            Explore products
            <ArrowRight className="w-4 h-4" />
          </Link>
        </header>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
            <Wallet className="w-4 h-4" />
            Why recipients love it
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {perks.map((perk) => (
              <div key={perk} className="rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-100 px-4 py-3 text-sm font-semibold">
                {perk}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
            <Sparkles className="w-4 h-4" />
            How to redeem
          </div>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
            <li>Add products to cart and proceed to checkout.</li>
            <li>Apply your gift card code on the payment step.</li>
            <li>Unused balance stays on your code for the next order.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
