import { ArrowRight, ClipboardList, Coins, Rocket, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";

const steps = [
  { title: "Apply & verify", copy: "Tell us about your catalog, serviceable pin codes, and GST details. We verify quality & pricing fit.", icon: ClipboardList },
  { title: "List fast", copy: "Bulk upload SKUs, sync inventory, and set smart delivery options with our playbooks.", icon: Store },
  { title: "Launch & grow", copy: "Run launch campaigns, earn boosted placement, and get payout insights in one dashboard.", icon: Rocket },
];

const perks = [
  "Guaranteed payouts on time",
  "Delivery + installation support options",
  "Real-time inventory controls",
  "Quality score boosts visibility",
  "Co-funded promotions on hero slots",
  "Dedicated vendor success lead",
];

export default function SellerRegistrationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white text-gray-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-16 space-y-12">
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <Store className="w-4 h-4" />
            Vendor Program
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Launch your store on OWEG in days.</h1>
          <p className="text-gray-600 max-w-3xl">
            Plug into fast logistics, curated storefronts, and customers ready to buy premium appliances. We help you price, ship, and shine.
          </p>
          <Link
            href="mailto:vendor@oweg.in?subject=Join%20OWEG%20as%20Vendor"
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-emerald-600 text-white px-5 py-3 text-sm font-semibold shadow hover:bg-emerald-700"
          >
            Start as Vendor
            <ArrowRight className="w-4 h-4" />
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {steps.map((step, idx) => (
            <div key={step.title} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
                  <step.icon className="w-6 h-6" />
                </div>
                <div className="text-xs font-semibold text-gray-500">Step {idx + 1}</div>
              </div>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{step.copy}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-600 via-emerald-500 to-lime-400 text-white p-8 shadow-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            Why vendors stay
          </div>
          <h2 className="text-2xl font-semibold">Earn more with transparent ops.</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {perks.map((perk) => (
              <div key={perk} className="rounded-2xl bg-white/10 border border-white/20 px-4 py-3 text-sm font-semibold">
                {perk}
              </div>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white text-emerald-700 px-4 py-2 font-semibold w-fit">
            <Coins className="w-4 h-4" />
            Clear payout schedules + dashboard visibility
          </div>
        </section>
      </div>
    </div>
  );
}
