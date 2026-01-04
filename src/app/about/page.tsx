import { Leaf, ShieldCheck, Sparkles, Truck, Users } from "lucide-react";

const stats = [
  { label: "Orders Delivered", value: "2.1M+", detail: "across 450+ cities" },
  { label: "Verified Sellers", value: "12k", detail: "quality-checked partners" },
  { label: "Avg. Delivery", value: "36 hrs", detail: "pan-India metros" },
  { label: "Customer Love", value: "4.8 ★", detail: "service rating" },
];

const values = [
  { icon: ShieldCheck, title: "Trust First", copy: "We vet every product, price, and partner so you never worry about what shows up at your door." },
  { icon: Truck, title: "Arrives Ready", copy: "From careful packaging to proactive tracking, we ship like it's meant for us." },
  { icon: Leaf, title: "Better Impact", copy: "We prioritize energy-efficient appliances, low-waste packaging, and greener delivery partners." },
  { icon: Users, title: "Human Help", copy: "Real people on chat, call, and doorstep support—no endless IVR loops." },
];

export default function AboutPage() {
  return (
    <div className="relative isolate overflow-hidden bg-gradient-to-b from-emerald-50 via-white to-white text-gray-900">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-24 h-64 w-64 rounded-full bg-emerald-200/50 blur-3xl" />
        <div className="absolute top-20 right-0 h-72 w-72 rounded-full bg-lime-200/50 blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-20 space-y-16 relative z-10">
        <header className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-xs font-semibold tracking-wide">
            <Sparkles className="w-4 h-4" />
            About OWEG
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
            We make premium appliances feel personal, fast, and joyful to buy.
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl">
            From kitchen wins to everyday essentials, OWEG blends curated products, intuitive shopping, and reliable delivery.
            We obsess over every detail so you can plug in, power up, and get back to living.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-emerald-100 bg-white/80 backdrop-blur shadow-sm px-4 py-5 flex flex-col gap-1"
            >
              <div className="text-2xl font-semibold text-gray-900">{stat.value}</div>
              <div className="text-sm text-gray-700">{stat.label}</div>
              <div className="text-xs text-gray-500">{stat.detail}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2 items-center">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">What keeps us building</h2>
            <p className="text-gray-600 leading-relaxed">
              We started OWEG because appliance shopping felt stale—too many tabs, unclear specs, no support after delivery.
              Our answer: sharp storytelling, transparent prices, and hands-on service. We’re always shipping new features
              that make buying feel closer to using.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {["Same-day metro delivery", "Quality score on every listing", "Live order concierge", "Green packaging where possible"].map((pill) => (
                <span key={pill} className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 font-semibold">
                  {pill}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-gradient-to-br from-white via-emerald-50 to-emerald-100 shadow-lg p-8 space-y-6">
            <div className="inline-flex items-center gap-3 rounded-full bg-white px-4 py-2 shadow-sm border border-gray-100 text-sm font-semibold text-emerald-700">
              <ShieldCheck className="w-4 h-4" />
              Zero-tricks pricing
            </div>
            <p className="text-lg font-semibold text-gray-900">
              We price-match smartly, display total landed cost upfront, and keep warranty terms on every product page.
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
              <div className="rounded-2xl bg-white p-4 border border-gray-100 shadow-sm">Warranty tracking inside your account</div>
              <div className="rounded-2xl bg-white p-4 border border-gray-100 shadow-sm">Technician-ready installation notes</div>
              <div className="rounded-2xl bg-white p-4 border border-gray-100 shadow-sm">Pickup-ready returns with packaging help</div>
              <div className="rounded-2xl bg-white p-4 border border-gray-100 shadow-sm">Human chat for part replacements</div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {values.map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_15px_45px_-28px_rgba(0,0,0,0.35)] flex gap-4"
            >
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
                <item.icon className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{item.copy}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
