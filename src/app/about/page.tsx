import { Leaf, ShieldCheck, Sparkles, Truck, Users } from "lucide-react";

const stats = [
  { label: "Orders Delivered", value: "2.1M+", detail: "across 450+ cities" },
  {
    label: "Verified Sellers",
    value: "12k",
    detail: "quality-checked partners",
  },
  { label: "Avg. Delivery", value: "36 hrs", detail: "pan-India metros" },
  { label: "Customer Love", value: "4.8 ★", detail: "service rating" },
];

const values = [
  {
    icon: ShieldCheck,
    title: "Trust First",
    copy: "We vet every product, price, and partner so you never worry about what shows up at your door.",
  },
  {
    icon: Truck,
    title: "Arrives Ready",
    copy: "From careful packaging to proactive tracking, we ship like it's meant for us.",
  },
  {
    icon: Leaf,
    title: "Better Impact",
    copy: "We prioritize energy-efficient appliances, low-waste packaging, and greener delivery partners.",
  },
  {
    icon: Users,
    title: "Human Help",
    copy: "Real people on chat, call, and doorstep support—no endless IVR loops.",
  },
];

export default function AboutPage() {
  return (
    <div className="relative isolate overflow-hidden bg-gradient-to-b from-emerald-50 via-white to-white text-gray-900">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-24 h-64 w-64 rounded-full bg-emerald-200/50 blur-3xl" />
        <div className="absolute top-20 right-0 h-72 w-72 rounded-full bg-lime-200/50 blur-3xl" />
      </div>

      <div className="oweg-container relative z-10 max-w-6xl space-y-12 py-12 md:space-y-16 md:py-20">
        <header className="space-y-5 md:space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-[var(--oweg-surface-tint)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--oweg-green-dark)]">
            <Sparkles className="w-4 h-4" />
            About OWEG
          </p>
          <h1 className="oweg-title text-[clamp(1.7rem,1.1rem+2.8vw,2.75rem)] leading-tight">
            We make premium appliances feel personal, fast, and joyful to buy.
          </h1>
          <p className="oweg-subtle max-w-3xl text-base md:text-lg">
            From kitchen wins to everyday essentials, OWEG blends curated
            products, intuitive shopping, and reliable delivery. We obsess over
            every detail so you can plug in, power up, and get back to living.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="oweg-surface-card flex flex-col gap-1 bg-white/80 px-4 py-5 backdrop-blur"
            >
              <div className="text-xl font-semibold text-gray-900 sm:text-2xl">
                {stat.value}
              </div>
              <div className="text-sm text-gray-700">{stat.label}</div>
              <div className="text-xs text-gray-500">{stat.detail}</div>
            </div>
          ))}
        </section>

        <section className="grid items-center gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="oweg-title text-[clamp(1.35rem,1rem+1.4vw,1.75rem)]">What keeps us building</h2>
            <p className="leading-relaxed text-[var(--oweg-ink-muted)]">
              We started OWEG because appliance shopping felt stale—too many
              tabs, unclear specs, no support after delivery. Our answer: sharp
              storytelling, transparent prices, and hands-on service. We’re
              always shipping new features that make buying feel closer to
              using.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                "Same-day metro delivery",
                "Quality score on every listing",
                "Live order concierge",
                "Green packaging where possible",
              ].map((pill) => (
                <span
                  key={pill}
                  className="rounded-full border border-[var(--oweg-border)] bg-[var(--oweg-surface-tint)] px-3 py-1 font-semibold text-[var(--oweg-green-dark)]"
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-5 rounded-[var(--oweg-radius-xl)] border border-[var(--oweg-border)] bg-gradient-to-br from-white via-[var(--oweg-surface-tint)] to-[#dff0d2] p-5 shadow-[var(--oweg-shadow-md)] sm:p-8 md:space-y-6">
            <div className="inline-flex items-center gap-3 rounded-full border border-[var(--oweg-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--oweg-green-dark)] shadow-[var(--oweg-shadow-sm)]">
              <ShieldCheck className="w-4 h-4" />
              Zero-tricks pricing
            </div>
            <p className="text-base font-semibold text-[var(--oweg-ink)] sm:text-lg">
              We price-match smartly, display total landed cost upfront, and
              keep warranty terms on every product page.
            </p>
            <div className="grid grid-cols-1 gap-3 text-sm text-[var(--oweg-ink-soft)] sm:grid-cols-2">
              <div className="rounded-[var(--oweg-radius-lg)] border border-[var(--oweg-border)] bg-white p-4 shadow-[var(--oweg-shadow-sm)]">
                Warranty tracking inside your account
              </div>
              <div className="rounded-[var(--oweg-radius-lg)] border border-[var(--oweg-border)] bg-white p-4 shadow-[var(--oweg-shadow-sm)]">
                Technician-ready installation notes
              </div>
              <div className="rounded-[var(--oweg-radius-lg)] border border-[var(--oweg-border)] bg-white p-4 shadow-[var(--oweg-shadow-sm)]">
                Pickup-ready returns with packaging help
              </div>
              <div className="rounded-[var(--oweg-radius-lg)] border border-[var(--oweg-border)] bg-white p-4 shadow-[var(--oweg-shadow-sm)]">
                Human chat for part replacements
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {values.map((item) => (
            <div
              key={item.title}
              className="oweg-surface-card flex gap-4 p-5 sm:p-6"
            >
              <div className="oweg-icon-tile h-12 w-12 shrink-0 text-[var(--oweg-green-dark)]">
                <item.icon className="w-6 h-6" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <h3 className="text-base font-semibold text-[var(--oweg-ink)] sm:text-lg">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--oweg-ink-muted)]">
                  {item.copy}
                </p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
