import { ChevronDown, Headphones, ShieldCheck, Timer } from "lucide-react";

const faqs = [
  {
    q: "How fast do you deliver?",
    a: "Metro orders are often same/next-day. Outside metros, we ship in 24 hours and average 2-5 working days. Real-time ETAs show at checkout.",
    badge: "Speed",
  },
  {
    q: "What if I need installation?",
    a: "Many appliances include brand installation. We also flag when self-install is easy and provide technician-ready notes in your order timeline.",
    badge: "Setup",
  },
  {
    q: "Do you support cash on delivery?",
    a: "Yes, COD is available on most pin codes. Some oversized items may need prepaid or part-payment—this is shown upfront.",
    badge: "Payments",
  },
  {
    q: "How do returns work?",
    a: "Initiate a return from your profile. We arrange pickup, packaging help if needed, and fast refunds after quality checks.",
    badge: "Returns",
  },
  {
    q: "Is my data safe?",
    a: "We use secure payments, tokenized cards, and strict privacy controls. You can request data export or deletion anytime.",
    badge: "Security",
  },
  {
    q: "How do I track my order?",
    a: "Live tracking sits inside your account + SMS/WhatsApp updates. You’ll see hand-off events, installer details, and support chat in one place.",
    badge: "Tracking",
  },
];

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/40 to-white text-gray-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <Headphones className="w-4 h-4" />
            FAQs & Support
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold">Ask us anything before you plug in.</h1>
          <p className="text-gray-600 max-w-3xl mx-auto">
            Quick answers to the most common questions. Need a human? Ping support from your profile—real people respond fast.
          </p>
        </header>

        <section className="grid gap-4">
          {faqs.map((item) => (
            <div
              key={item.q}
              className="group rounded-2xl border border-gray-100 bg-white shadow-[0_18px_38px_-28px_rgba(0,0,0,0.35)] px-5 py-4 transition hover:-translate-y-1 hover:shadow-[0_22px_46px_-28px_rgba(0,0,0,0.45)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 text-xs font-semibold">
                      {item.badge}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 transition" />
                  </div>
                  <p className="text-lg font-semibold">{item.q}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-600 via-emerald-500 to-lime-400 text-white p-6 shadow-lg space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4" />
              Priority Care
            </div>
            <h3 className="text-xl font-semibold">Need escalation?</h3>
            <p className="text-sm text-white/90">Talk to the Priority Care team for warranty, installation, or delivery escalations.</p>
            <div className="text-sm font-semibold">Email: support@oweg.in</div>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
              <Timer className="w-4 h-4" />
              Quick chat
            </div>
            <h3 className="text-xl font-semibold text-gray-900">Live help from profile</h3>
            <p className="text-sm text-gray-600">Jump to Profile → Support to start a chat. We respond within minutes during 9 AM–10 PM IST.</p>
            <div className="text-sm text-gray-700">Call: +91 89281 02299</div>
          </div>
        </section>
      </div>
    </div>
  );
}
