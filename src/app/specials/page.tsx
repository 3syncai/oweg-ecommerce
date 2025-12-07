import { Flame, Zap } from "lucide-react";

const specials = [
  { title: "Weekend Flash", copy: "48-hour drops on popular mixers, air fryers, and smart lights.", badge: "Live" },
  { title: "Combo Power", copy: "Bundle kitchen essentials with flat savings + faster delivery.", badge: "Combos" },
  { title: "Upgrade Swap", copy: "Exchange select old appliances for instant discounts.", badge: "Exchange" },
  { title: "App-only", copy: "Mobile-only price locks with extra coins on checkout.", badge: "Mobile" },
];

export default function SpecialsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white text-gray-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-16 space-y-10">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <Flame className="w-4 h-4" />
            Specials
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Limited-time drops curated for you.</h1>
          <p className="text-gray-600">Fresh offers with transparent pricing. Track what’s live and what’s coming next.</p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specials.map((deal) => (
            <div
              key={deal.title}
              className="group rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_22px_48px_-28px_rgba(0,0,0,0.45)]"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
                {deal.badge}
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-semibold mt-3">{deal.title}</h3>
              <p className="text-sm text-gray-600 mt-2">{deal.copy}</p>
              <div className="text-xs text-emerald-700 font-semibold mt-3 group-hover:translate-x-1 transition">See eligible products →</div>
            </div>
          ))}
        </section>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm font-semibold">
          Turn on notifications in Profile → Preferences to be the first to catch flash drops.
        </div>
      </div>
    </div>
  );
}
