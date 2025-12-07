import { ArrowRight, HandHeart, MapPin, PhoneCall, Users } from "lucide-react";
import Link from "next/link";

const highlights = [
  { title: "Hyperlocal leads", copy: "Get orders from nearby pin codes and earn on every fulfilled delivery.", icon: MapPin },
  { title: "Assist & earn", copy: "Help shoppers pick the right appliance; earn referral rewards instantly.", icon: HandHeart },
  { title: "Fast support", copy: "Dedicated ops manager + WhatsApp group for escalations.", icon: PhoneCall },
];

export default function AgentRegistrationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/40 to-white text-gray-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-16 space-y-12">
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <Users className="w-4 h-4" />
            Agent / Partner Track
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Grow with OWEG as a local agent.</h1>
          <p className="text-gray-600 max-w-3xl">
            Guide shoppers, collect orders, and assist with doorstep deliveries. We handle catalog, pricing, and payouts.
          </p>
          <Link
            href="mailto:partners@oweg.in?subject=Join%20OWEG%20as%20Agent"
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-emerald-600 text-white px-5 py-3 text-sm font-semibold shadow hover:bg-emerald-700"
          >
            Apply now
            <ArrowRight className="w-4 h-4" />
          </Link>
        </header>

        <section className="grid gap-5 md:grid-cols-3">
          {highlights.map((item) => (
            <div key={item.title} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
                <item.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.copy}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-600 via-emerald-500 to-lime-400 text-white p-8 shadow-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            How it works
          </div>
          <div className="grid gap-4 sm:grid-cols-3 text-sm font-semibold">
            <div className="rounded-2xl bg-white/10 border border-white/20 px-4 py-3">1. Submit your pin codes + KYC</div>
            <div className="rounded-2xl bg-white/10 border border-white/20 px-4 py-3">2. Join our onboarding sprint (60 mins)</div>
            <div className="rounded-2xl bg-white/10 border border-white/20 px-4 py-3">3. Start earning on orders + support</div>
          </div>
          <p className="text-sm text-white/90">
            You’ll get a dashboard to track referrals, delivery status, and payouts—plus scripts to help shoppers pick the right product.
          </p>
        </section>
      </div>
    </div>
  );
}
