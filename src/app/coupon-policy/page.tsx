import { BadgePercent, ShieldCheck, Wallet } from "lucide-react";

const rules = [
  "Coupons show applicable categories, minimum order values, and expiry dates at checkout.",
  "Some coupons exclude cash on delivery or specific pin codes; you’ll see eligibility instantly.",
  "Only one coupon applies per order unless otherwise mentioned.",
  "If an order is canceled or returned, coupon benefits may lapse; re-apply on your next eligible order.",
  "Abuse or misuse of coupon programs can lead to account review or suspension.",
];

export default function CouponPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/35 to-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <BadgePercent className="w-4 h-4" />
            Coupon Code Policy
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Transparent savings, no hidden strings.</h1>
          <p className="text-gray-600">See your savings upfront and understand how coupons behave on returns or COD.</p>
        </header>

        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
          <h2 className="text-xl font-semibold">How coupons work</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {rules.map((rule) => (
              <li key={rule} className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 text-emerald-800 p-5 space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white text-emerald-700 px-3 py-1 text-xs font-semibold">
              <Wallet className="w-4 h-4" />
              Instant view
            </div>
            <p className="text-sm font-semibold">
              Final payable amount shows before you pay, with taxes and fees baked in. No surprises at delivery.
            </p>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-white p-5 space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4" />
              Fair use
            </div>
            <p className="text-sm text-gray-700">
              We monitor fairness to keep deals exciting for everyone. If something feels off, write to support@oweg.in for a manual review.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
